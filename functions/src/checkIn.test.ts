import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import firebaseFunctionsTest from "firebase-functions-test";
import { AdminIndex, GameSettings, Profile } from "../../types";
import { db } from "./firebase";
import { getProfile } from "./getProfile";
import { DEFAULT_SETTINGS, setCachedSettings } from "./settings";
import { playersWhoMissed, removeMissedPlayers, sweepDue } from "./checkInSweep";
import { pointIn } from "./testBuildings";

const testEnv = firebaseFunctionsTest();
const wrappedGetProfile = testEnv.wrap(getProfile);

// a loop of four players of our own: a -> b -> c -> d -> a (each chases the next)
const loop = ["ci_a", "ci_b", "ci_c", "ci_d"].map((name) => `${name}@milton.edu`);
const [A, B, C, D] = loop;

function profileFor(i: number): Profile {
  const next = loop[(i + 1) % loop.length];
  return {
    alive: true,
    role: "player",
    firstName: `First${i}`,
    lastName: `Last${i}`,
    class: "senior",
    dayorboard: "day",
    tags: 0,
    chaser: loop[(i + loop.length - 1) % loop.length],
    target: { firstName: `First${(i + 1) % loop.length}`, lastName: `Last${(i + 1) % loop.length}`, email: next, location: "Faulkner House" },
  };
}

async function resetLoop() {
  const batch = db.batch();
  loop.forEach((email, i) => batch.set(db.doc(`data/${email}`), profileFor(i)));
  await batch.commit();
}

const authFor = (email: string, admin = false) => ({
  uid: email,
  token: { email, email_verified: true, ...(admin && { admin: true }) },
});

// getProfile reads settings through the in-memory cache, so tests set them there
function useSettings(changes: Partial<GameSettings>) {
  setCachedSettings({ ...DEFAULT_SETTINGS, ...changes });
}

beforeAll(resetLoop);
beforeEach(() => useSettings({}));

describe("target location visibility", () => {
  it("leaves the target's building out when see target location is off", async () => {
    useSettings({ seeTargetLocation: false });
    const result = await wrappedGetProfile({ data: {}, auth: authFor(A) } as any) as Profile;
    expect(result.target.email).toBe(B);
    expect(result.target.location).toBeUndefined();

    // it's still saved
    const stored = (await db.doc(`data/${A}`).get()).data() as Profile;
    expect(stored.target.location).toBeDefined();
  });

  it("leaves it out when location is off", async () => {
    useSettings({ locationEnabled: false });
    const result = await wrappedGetProfile({ data: {}, auth: authFor(A) } as any) as Profile;
    expect(result.target.location).toBeUndefined();
  });

  it("still shows it to admins looking at a player", async () => {
    useSettings({ seeTargetLocation: false });
    const result = await wrappedGetProfile({ data: { email: A }, auth: authFor(D, true) } as any) as Profile;
    expect(result.target.location).toBeDefined();
  });

  it("with share to see on, only sends it back when the call shared a location", async () => {
    useSettings({ shareToSeeTargetLocation: true });
    const without = await wrappedGetProfile({ data: {}, auth: authFor(A) } as any) as Profile;
    expect(without.target.location).toBeUndefined();

    const withLocation = await wrappedGetProfile({
      data: { location: pointIn("Science Building") }, auth: authFor(A),
    } as any) as Profile;
    expect(withLocation.target.location).toBeDefined();
  });
});

describe("check-in", () => {
  beforeAll(resetLoop);

  it("doesn't check in outside the check-in building", async () => {
    useSettings({ checkInEnabled: true, checkInBuilding: "Faulkner House", locationEnabled: false });
    const result = await wrappedGetProfile({
      data: { location: pointIn("Science Building") }, auth: authFor(A),
    } as any) as Profile;
    expect(result.checkedInAt).toBeUndefined();
    expect((await db.doc(`data/${A}`).get()).data()?.checkedInAt).toBeUndefined();
  });

  it("checks in once a day, even with location sharing off", async () => {
    useSettings({ checkInEnabled: true, checkInBuilding: "Science Building", locationEnabled: false });
    const first = await wrappedGetProfile({
      data: { location: pointIn("Science Building") }, auth: authFor(A),
    } as any) as Profile;
    expect(first.checkedInAt).toBeTypeOf("number");
    expect(first.location).toBe("Science Building");

    // location is off, so the chaser's copy wasn't touched
    expect(((await db.doc(`data/${D}`).get()).data() as Profile).target.location).toBe("Faulkner House");

    // a second check-in the same day doesn't write again
    const second = await wrappedGetProfile({
      data: { location: pointIn("Science Building") }, auth: authFor(A),
    } as any) as Profile;
    expect(second.checkedInAt).toBe(first.checkedInAt);
  });

  it("accepts any building when none is set", async () => {
    useSettings({ checkInEnabled: true, checkInBuilding: null });
    const result = await wrappedGetProfile({
      data: { location: pointIn("Faulkner House") }, auth: authFor(B),
    } as any) as Profile;
    expect(result.checkedInAt).toBeTypeOf("number");
  });
});

describe("sweepDue", () => {
  // 2026-11-09 20:30 EST
  const now = Date.UTC(2026, 10, 10, 1, 30);
  const on = { ...DEFAULT_SETTINGS, checkInEnabled: true, checkInDeadline: 20 * 60 };

  it("runs after the deadline", () => {
    expect(sweepDue(on, now)).toBe("yes");
  });
  it("waits for the deadline", () => {
    expect(sweepDue({ ...on, checkInDeadline: 21 * 60 }, now)).toBe("no");
  });
  it("runs once a day", () => {
    expect(sweepDue({ ...on, lastCheckInSweepDay: "2026-11-09" }, now)).toBe("no");
  });
  it("does nothing when check-in is off or the game isn't live", () => {
    expect(sweepDue({ ...on, checkInEnabled: false }, now)).toBe("no");
    expect(sweepDue({ ...on, endsAt: now - 1 }, now)).toBe("no");
  });
  it("skips a day the game started after the deadline", () => {
    expect(sweepDue({ ...on, startsAt: Date.UTC(2026, 10, 10, 1, 15) }, now)).toBe("skip"); // 8:15pm
  });
});

describe("playersWhoMissed", () => {
  const now = Date.UTC(2026, 10, 10, 1, 30);
  const row = (alive: boolean, checkedInAt: number | null, role: Profile["role"] = "player") =>
    ({ alive, checkedInAt, role } as AdminIndex["players"][string]);

  it("finds alive players who didn't check in today", () => {
    const index = {
      updatedAt: now,
      players: {
        in: row(true, now - 60_000),
        yesterday: row(true, now - 24 * 3600_000),
        never: row(true, null),
        out: row(false, null),
        observer: row(true, null, "observer"),
      },
    };
    expect(playersWhoMissed(index, now)).toEqual({ missed: ["yesterday", "never"], everyoneMissed: false });
  });

  it("takes nobody out if everyone missed", () => {
    const index = { updatedAt: now, players: { a: row(true, null), b: row(true, null) } };
    expect(playersWhoMissed(index, now)).toEqual({ missed: [], everyoneMissed: true });
  });
});

describe("removeMissedPlayers", () => {
  beforeAll(resetLoop);

  it("relinks the loop around players who missed, without a tag or revenge", async () => {
    const now = Date.now();
    await db.doc(`data/${C}`).update({ checkedInAt: now }); // C checked in after the index was read

    const { removed, winner } = await removeMissedPlayers([B, C], now);
    expect(removed).toEqual([B]);
    expect(winner).toBeNull();

    const [a, b, c] = await Promise.all([A, B, C].map(async (e) => (await db.doc(`data/${e}`).get()).data() as Profile));
    expect(b.alive).toBe(false);
    expect(b.chaser).toBe("none"); // nobody tagged them, so revenge and the leaderboard skip them
    expect(a.target.email).toBe(C);
    expect(a.tags).toBe(0);
    expect(c.chaser).toBe(A);
    expect(c.alive).toBe(true);

    const log = await db.collection("adminLog")
      .where("action", "==", "missedCheckIn").where("affected", "array-contains", B).get();
    expect(log.empty).toBe(false);
  });
});
