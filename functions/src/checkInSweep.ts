import { onSchedule } from "firebase-functions/v2/scheduler";
import { AdminIndex, AdminIndexRow, GameSettings, Profile } from "../../types";
import { db } from "./firebase";
import { ADMIN_INDEX_PATH, logAdminAction, toAdminIndexRow } from "./adminIndex";
import { Chain } from "./chain";
import { gamePhase, getSettings, setCachedSettings, settingsDoc, withDefaults } from "./settings";
import { SCHOOL_TIME_ZONE, checkedInToday, schoolDay } from "./schoolTime";

// players taken out per transaction, to stay well inside Firestore's transaction limits
const CHUNK_SIZE = 100;

export interface SweepResult {
  ran: boolean;
  removed: string[];
  winner: string | null;
}

const NOTHING: SweepResult = { ran: false, removed: [], winner: null };

/** Marks today as swept, so later runs today return straight away */
async function markSwept(settings: GameSettings, dayKey: string) {
  await settingsDoc().set({ lastCheckInSweepDay: dayKey }, { merge: true });
  setCachedSettings({ ...settings, lastCheckInSweepDay: dayKey });
}

/**
 * Takes a batch of players who missed check-in out of the loop, in one transaction.
 * Each player is checked against their real profile first, since the admin index can be a
 * moment behind (e.g. they checked in just before the deadline).
 * Their chaser is set to "none": nobody tagged them, so they get no last words, nobody gets a
 * tag, revenge isn't applied, and nobody's revenge brings them back.
 */
export async function removeMissedPlayers(emails: string[], now: number): Promise<{ removed: string[]; winner: string | null }> {
  return db.runTransaction(async (tx) => {
    const chain = new Chain(db, tx);
    const removed: string[] = [];
    let winner: string | null = null;

    for (const email of emails) {
      const player = await chain.load(email);
      if (!player.alive || player.role !== "player" || checkedInToday(player.checkedInAt, now)) continue;

      const result = await chain.remove(email);
      player.chaser = "none";
      removed.push(email);
      if (result.winner) winner = result.winner;
    }
    if (removed.length === 0) return { removed, winner };

    chain.save();

    // write the changed admin table rows now (syncAdminIndex would a moment later)
    const rows: Record<string, AdminIndexRow> = {};
    for (const [changedEmail, profile] of chain.changed()) {
      rows[changedEmail] = toAdminIndexRow(profile as Profile);
    }
    tx.set(db.doc(ADMIN_INDEX_PATH), { players: rows, updatedAt: now }, { merge: true });

    logAdminAction(db, tx, {
      by: "system",
      action: "missedCheckIn",
      target: null,
      affected: removed,
    });

    return { removed, winner };
  });
}

/**
 * Whether the sweep should run now:
 * "no" (check-in off, game not live, before the deadline, or already swept today),
 * "skip" (the game started today after the deadline, so just mark today as swept), or "yes".
 */
export function sweepDue(settings: GameSettings, now: number): "no" | "skip" | "yes" {
  if (!settings.checkInEnabled || gamePhase(settings, now) !== "live") return "no";

  const { dayKey, minutes } = schoolDay(now);
  if (minutes < settings.checkInDeadline || settings.lastCheckInSweepDay === dayKey) return "no";

  if (settings.startsAt !== null) {
    const start = schoolDay(settings.startsAt);
    if (start.dayKey === dayKey && start.minutes >= settings.checkInDeadline) return "skip";
  }
  return "yes";
}

/**
 * The alive players who haven't checked in today, from the admin index.
 * Returns nobody if every alive player missed, so a bad day (or a broken check-in) can't end the game.
 */
export function playersWhoMissed(
  index: AdminIndex | undefined,
  now: number,
): { missed: string[]; everyoneMissed: boolean } {
  const alive = Object.entries(index?.players ?? {})
    .filter(([, row]) => row.role === "player" && row.alive);
  const missed = alive
    .filter(([, row]) => !checkedInToday(row.checkedInAt, now))
    .map(([email]) => email);
  const everyoneMissed = missed.length > 0 && missed.length === alive.length;
  return { missed: everyoneMissed ? [] : missed, everyoneMissed };
}

/**
 * Once a school day, after the check-in deadline, takes every alive player who hasn't
 * checked in that day out of the game.
 *
 * Reads: the settings (cached, and usually the only read), then on the one run a day that
 * does anything, the admin index to find who missed, plus the chain around each of them.
 * Nobody is taken out if every alive player missed, so a bad day can't end the game.
 */
export async function runCheckInSweep(now = Date.now()): Promise<SweepResult> {
  const settings = await getSettings();
  const due = sweepDue(settings, now);
  if (due === "no") return NOTHING;

  const { dayKey } = schoolDay(now);
  // the game started today after the deadline, so there was no chance to check in
  if (due === "skip") {
    await markSwept(settings, dayKey);
    return NOTHING;
  }

  // another instance may have swept since our settings were cached
  const stored = withDefaults((await settingsDoc().get()).data() as Partial<GameSettings> | undefined);
  if (stored.lastCheckInSweepDay === dayKey) {
    setCachedSettings(stored);
    return NOTHING;
  }

  const index = (await db.doc(ADMIN_INDEX_PATH).get()).data() as AdminIndex | undefined;
  const { missed, everyoneMissed } = playersWhoMissed(index, now);

  if (everyoneMissed) {
    console.warn(`check-in sweep ${dayKey}: every alive player missed, so nobody was taken out`);
    await markSwept(stored, dayKey);
    return { ran: true, removed: [], winner: null };
  }

  const removed: string[] = [];
  let winner: string | null = null;
  for (let i = 0; i < missed.length; i += CHUNK_SIZE) {
    const result = await removeMissedPlayers(missed.slice(i, i + CHUNK_SIZE), now);
    removed.push(...result.removed);
    winner = result.winner ?? winner;
  }

  // only marked once every chunk is saved, so a failed run is finished by the next one
  await markSwept(stored, dayKey);
  console.log(`check-in sweep ${dayKey}: took out ${removed.length} player(s)${winner ? `, ${winner} won` : ""}`);
  return { ran: true, removed, winner };
}

/**
 * Runs every 5 minutes, but does nothing (beyond reading the cached settings) except on the
 * first run after each day's deadline. The deadline is a setting, and a schedule is fixed at
 * deploy time, so polling is what lets admins change it.
 */
export const checkInSweep = onSchedule(
  { schedule: "every 5 minutes", timeZone: SCHOOL_TIME_ZONE },
  async () => {
    await runCheckInSweep();
  },
);
