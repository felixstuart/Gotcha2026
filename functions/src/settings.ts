import { HttpsError, onCall } from "firebase-functions/v2/https";
import { GameSettings } from "../../types";
import { requireAdmin } from "./auth";
import { requireRegisteredSchoolUser } from "./authorization";
import { db } from "./firebase";
import { logAdminAction } from "./adminIndex";
import { BUILDING_NAMES } from "./buildings";
import { pastDeadline, schoolDay } from "./schoolTime";

// stored in config/game
export const settingsDoc = () => db.collection("config").doc("game");

/**
 * How long each function instance trusts its copy of the settings.
 * Settings are read on almost every call, so this keeps them to about one read per
 * instance per window. The catch: after an admin saves, other instances can keep the
 * old settings for up to this long (the instance that saved updates right away).
 * Set SETTINGS_CACHE_TTL_MS=0 to turn the cache off (e.g. for tests).
 */
const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS ?? 30_000);

/** What the game does before an admin has saved anything (matches how it worked before settings) */
export const DEFAULT_SETTINGS: GameSettings = {
  startsAt: null,
  endsAt: null,
  revengeEnabled: true,
  locationEnabled: true,
  seeTargetLocation: true,
  shareToSeeTargetLocation: false,
  checkInEnabled: false,
  checkInDeadline: 20 * 60, // 8:00 PM
  checkInBuilding: null,
  lastCheckInSweepDay: null,
  updatedAt: null,
  updatedBy: null,
};

let cached: { settings: GameSettings; fetchedAt: number } | null = null;
// shared by calls that arrive while a read is already running, so they don't each read
let inFlight: Promise<GameSettings> | null = null;

/** Settings as stored, with defaults for anything missing (so older docs keep working when new settings are added) */
export function withDefaults(data: Partial<GameSettings> | undefined): GameSettings {
  return { ...DEFAULT_SETTINGS, ...data };
}

/** Lets the check-in sweep update this instance's copy after it saves, like updateGameSettings does */
export function setCachedSettings(settings: GameSettings) {
  cached = { settings, fetchedAt: Date.now() };
}

/** The current settings, from this instance's cache when it's fresh enough */
export async function getSettings(): Promise<GameSettings> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.settings;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const snap = await settingsDoc().get();
      const settings = withDefaults(snap.data() as Partial<GameSettings> | undefined);
      cached = { settings, fetchedAt: Date.now() };
      return settings;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Where the game is right now, based on the start and end times */
export function gamePhase(settings: GameSettings, now = Date.now()): "before" | "live" | "over" {
  if (settings.startsAt !== null && now < settings.startsAt) return "before";
  if (settings.endsAt !== null && now >= settings.endsAt) return "over";
  return "live";
}

/** Checks a partial settings update from an admin and drops anything that isn't a setting */
function parseSettingsUpdate(raw: unknown): Partial<GameSettings> {
  if (typeof raw !== "object" || raw === null) {
    throw new HttpsError("invalid-argument", "settings must be an object");
  }
  const input = raw as Record<string, unknown>;
  const update: Partial<GameSettings> = {};

  for (const field of ["startsAt", "endsAt"] as const) {
    if (input[field] === undefined) continue;
    const value = input[field];
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new HttpsError("invalid-argument", `${field} must be a time or null`);
    }
    update[field] = value as number | null;
  }

  const booleans = [
    "revengeEnabled", "locationEnabled", "seeTargetLocation", "shareToSeeTargetLocation", "checkInEnabled",
  ] as const;
  for (const field of booleans) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "boolean") {
      throw new HttpsError("invalid-argument", `${field} must be true or false`);
    }
    update[field] = input[field] as boolean;
  }

  if (input.checkInDeadline !== undefined) {
    const value = input.checkInDeadline;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 24 * 60) {
      throw new HttpsError("invalid-argument", "checkInDeadline must be minutes after midnight (0 to 1439)");
    }
    update.checkInDeadline = value;
  }

  if (input.checkInBuilding !== undefined) {
    const value = input.checkInBuilding;
    if (value !== null && (typeof value !== "string" || !BUILDING_NAMES.includes(value))) {
      throw new HttpsError("invalid-argument", "checkInBuilding must be a building name, or null for any building");
    }
    update.checkInBuilding = value;
  }

  // lastCheckInSweepDay is the sweep's, so it's dropped like anything else that isn't a setting
  return update;
}

/**
 * Returns the game settings. Anyone on the roster can read them (the app needs the times and
 * switches), but only admins are told which admin last changed them.
 */
export const getGameSettings = onCall(async (request): Promise<GameSettings> => {
  const member = await requireRegisteredSchoolUser(request);
  const settings = await getSettings();
  return member.profile.role === "admin" ? settings : { ...settings, updatedBy: null };
});

/**
 * Lets an admin change some or all of the settings, and logs what changed.
 * Returns the full saved settings. Reads the stored doc in a transaction (not the cache),
 * so the update builds on what's really saved.
 */
export const updateGameSettings = onCall(async (request): Promise<GameSettings> => {
  const adminEmail = await requireAdmin(request);
  const update = parseSettingsUpdate((request.data as { settings?: unknown } | null)?.settings);

  const settings = await db.runTransaction(async (tx) => {
    const ref = settingsDoc();
    const current = withDefaults((await tx.get(ref)).data() as Partial<GameSettings> | undefined);
    const now = Date.now();
    const next: GameSettings = {
      ...current,
      ...update,
      updatedAt: now,
      updatedBy: adminEmail,
    };

    // turning check-in on (or moving the deadline) after today's deadline has passed shouldn't
    // take out everyone who hadn't checked in yet, so today counts as already swept
    const checkInStarting = next.checkInEnabled &&
      (!current.checkInEnabled || next.checkInDeadline !== current.checkInDeadline);
    if (checkInStarting && pastDeadline(next.checkInDeadline, now)) {
      next.lastCheckInSweepDay = schoolDay(now).dayKey;
    }

    if (next.startsAt !== null && next.endsAt !== null && next.startsAt >= next.endsAt) {
      throw new HttpsError("invalid-argument", "The game has to end after it starts");
    }

    // only log the settings that actually changed
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, value] of Object.entries(update)) {
      const from = current[field as keyof GameSettings];
      if (from !== value) changes[field] = { from, to: value };
    }

    tx.set(ref, next);
    if (Object.keys(changes).length > 0) {
      logAdminAction(db, tx, { by: adminEmail, action: "updateSettings", target: null, changes });
    }
    return next;
  });

  // this instance sees the change straight away; others pick it up within CACHE_TTL_MS
  setCachedSettings(settings);
  return settings;
});
