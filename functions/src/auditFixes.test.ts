import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import firebaseFunctionsTest from "firebase-functions-test";
import { ClientLastWordsResponse, ClientTaggedOutResponse, GameSettings, Profile } from "../../types";
import { db } from "./firebase";
import { getProfile } from "./getProfile";
import { getAdminLog } from "./getAdminLog";
import { adminUpdateProfile } from "./adminUpdateProfile";
import { tagOut } from "./tagOut";
import { getLastWords, lastWordsIndexPath } from "./getLastWords";
import { setLastWords } from "./setLastWords";
import { reviveVictims } from "./revenge";
import { runCheckInSweep } from "./checkInSweep";
import { DEFAULT_SETTINGS, getGameSettings, setCachedSettings, settingsDoc } from "./settings";

const testEnv = firebaseFunctionsTest();
const call = <T>(fn: any, email: string, data: unknown = {}, admin = false) =>
  testEnv.wrap(fn)({
    data,
    auth: { uid: email, token: { email, email_verified: true, ...(admin && { admin: true }) } },
  } as any) as Promise<T>;

const address = (name: string) => `af_${name}@milton.edu`;
const ADMIN = address("admin");
const DEMOTED = address("demoted"); // still has the admin claim on their token, but not the role

function player(name: string, chaser: string, target: string, alive = true): Profile {
  return {
    alive,
    role: "player",
    firstName: name,
    lastName: "Test",
    class: "senior",
    dayorboard: "day",
    tags: 0,
    chaser: address(chaser),
    target: { firstName: target, lastName: "Test", email: address(target) },
  };
}

const read = async (name: string) => (await db.doc(`data/${address(name)}`).get()).data() as Profile;

/** Follows targets from `start` until it comes back round, checking every chaser points back */
async function walkLoop(start: string): Promise<string[]> {
  const names = [start];
  let current = start;
  for (let i = 0; i < 20; i++) {
    const profile = await read(current);
    expect(profile.alive, `${current} is alive`).toBe(true);
    const next = profile.target.email.replace(/^af_|@milton\.edu$/g, "");
    expect((await read(next)).chaser, `${next}'s chaser`).toBe(address(current));
    if (next === start) return names;
    names.push(next);
    current = next;
  }
  throw new Error("the loop never closed");
}

beforeAll(async () => {
  const batch = db.batch();
  batch.set(db.doc(`data/${ADMIN}`), { role: "admin", firstName: "Audit", lastName: "Admin" });
  batch.set(db.doc(`data/${DEMOTED}`), { ...player("demoted", "none", "none", false), chaser: "none" });
  // a loop of three for the profile and admin edit tests: one -> two -> three -> one
  batch.set(db.doc(`data/${address("one")}`), player("one", "three", "two"));
  batch.set(db.doc(`data/${address("two")}`), player("two", "one", "three"));
  batch.set(db.doc(`data/${address("three")}`), player("three", "two", "one"));
  await batch.commit();
});

beforeEach(() => setCachedSettings({ ...DEFAULT_SETTINGS }));

describe("admin access follows the roster, not the token claim", () => {
  it("refuses a demoted admin whose token still has the claim", async () => {
    await expect(call(getAdminLog, DEMOTED, {}, true)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(call(adminUpdateProfile, DEMOTED, { email: address("one"), changes: { tags: 5 } }, true))
      .rejects.toMatchObject({ code: "permission-denied" });
    // the functions players share with admins don't trust the claim either
    await expect(call(getProfile, DEMOTED, { email: address("one") }, true))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(call(tagOut, DEMOTED, { email: address("one") }, true))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect((await read("one")).alive).toBe(true);
  });

  it("still lets a real admin in", async () => {
    await expect(call(getAdminLog, ADMIN, {}, true)).resolves.toHaveProperty("log");
  });

  it("needs the claim too, so a token from before a promotion isn't enough", async () => {
    await expect(call(getAdminLog, ADMIN)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("what players are told", () => {
  it("doesn't tell a player who is chasing them, or which admin edited them", async () => {
    await db.doc(`data/${address("two")}`).update({ lastEditedBy: ADMIN, lastEditedAt: 1 });
    const own = await call<Profile>(getProfile, address("two"));
    expect(own.chaser).toBe("");
    expect(own.lastEditedBy).toBeUndefined();
    expect(own.lastEditedAt).toBeUndefined();
    expect(own.target.email).toBe(address("three")); // they still get their target
    expect(JSON.stringify(own)).not.toContain(address("one"));
  });

  it("still shows admins the chaser", async () => {
    const seen = await call<Profile>(getProfile, ADMIN, { email: address("two") }, true);
    expect(seen.chaser).toBe(address("one"));
  });

  it("only tells admins who last changed the settings", async () => {
    setCachedSettings({ ...DEFAULT_SETTINGS, updatedAt: 1, updatedBy: ADMIN });
    expect((await call<GameSettings>(getGameSettings, address("two"))).updatedBy).toBeNull();
    expect((await call<GameSettings>(getGameSettings, ADMIN, {}, true)).updatedBy).toBe(ADMIN);
  });
});

describe("admin edits", () => {
  it("won't turn a player who is still in the loop into an observer", async () => {
    await expect(call(adminUpdateProfile, ADMIN, { email: address("three"), changes: { role: "observer" } }, true))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect((await read("three")).role).toBe("player");
  });
});

describe("last words", () => {
  // far in the future, so these are the newest whatever the other test files have written
  const later = Date.now() + 1000 * 60 * 60 * 24 * 365;
  const entries = [
    { id: address("lw_old"), lw: "aaa oldest", timestamp: later },
    { id: address("lw_blank"), lw: "", timestamp: later + 1 },
    { id: address("lw_mid"), lw: "zzz middle", timestamp: later + 2 },
    { id: address("lw_new"), lw: "mmm newest", timestamp: later + 3 },
  ];

  beforeAll(async () => {
    const batch = db.batch();
    for (const { id, ...entry } of entries) batch.set(db.doc(`lastWords/${id}`), { ...entry, author: "Audit Test" });
    batch.delete(db.doc(lastWordsIndexPath));
    await batch.commit();
  });
  afterAll(async () => {
    const batch = db.batch();
    for (const { id } of entries) batch.delete(db.doc(`lastWords/${id}`));
    batch.delete(db.doc(lastWordsIndexPath));
    await batch.commit();
  });

  it("lists the newest first, not alphabetically, and skips blank ones", async () => {
    const { lastWords } = await call<ClientLastWordsResponse>(getLastWords, address("two"));
    expect(lastWords.slice(0, 3).map((entry) => entry.lw)).toEqual(["mmm newest", "zzz middle", "aaa oldest"]);
    expect(lastWords.length).toBeLessThanOrEqual(10);
    expect(lastWords.every((entry) => entry.lw !== "")).toBe(true);
  });

  it("holds last words to the length the apps allow", async () => {
    await expect(call(setLastWords, address("two"), { lastWords: "x".repeat(61) }))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("tag out", () => {
  it("doesn't send a player the admin table rows of the players around them", async () => {
    const batch = db.batch();
    batch.set(db.doc(`data/${address("t_a")}`), player("t_a", "t_c", "t_b"));
    batch.set(db.doc(`data/${address("t_b")}`), player("t_b", "t_a", "t_c"));
    batch.set(db.doc(`data/${address("t_c")}`), player("t_c", "t_b", "t_a"));
    await batch.commit();

    const result = await call<ClientTaggedOutResponse>(tagOut, address("t_b"));
    expect(result.status).toBe(200);
    expect(result.rows).toEqual({});
    expect((await read("t_a")).tags).toBe(1);

    // an admin tagging someone out does get them, to patch the admin table
    const asAdmin = await call<ClientTaggedOutResponse>(tagOut, ADMIN, { email: address("t_c") }, true);
    expect(Object.keys(asAdmin.rows)).toContain(address("t_c"));
  });
});

describe("revenge", () => {
  // r -> q -> x -> f -> r was the loop. x had tagged out p1 then p2.
  // then x was tagged out by q (so q -> f), and q was tagged out by r (so r -> f)
  // before x's revenge got to run
  beforeAll(async () => {
    const batch = db.batch();
    batch.set(db.doc(`data/${address("r")}`), { ...player("r", "f", "f"), tags: 1 });
    batch.set(db.doc(`data/${address("f")}`), player("f", "r", "r"));
    batch.set(db.doc(`data/${address("q")}`), { ...player("q", "r", "f", false), tags: 1 });
    batch.set(db.doc(`data/${address("x")}`), { ...player("x", "q", "f", false), tags: 2 });
    batch.set(db.doc(`data/${address("p1")}`), player("p1", "x", "x", false));
    batch.set(db.doc(`data/${address("p2")}`), player("p2", "x", "x", false));
    batch.set(db.doc(`lastWords/${address("p1")}`), { lw: "first out", author: "p1 Test", timestamp: 1000 });
    batch.set(db.doc(`lastWords/${address("p2")}`), { lw: "", author: "p2 Test", timestamp: 2000 });
    await batch.commit();
  });

  it("keeps the loop closed when the tagger's chaser has gone out too", async () => {
    expect(await reviveVictims(address("x"))).toEqual([address("p1"), address("p2")]);

    // they go in after r, the closest player up the line who is still in, earliest tagged first
    expect(await walkLoop("r")).toEqual(["r", "p1", "p2", "f"]);
    expect((await read("x")).alive).toBe(false);
    expect((await read("q")).alive).toBe(false);
  });

  it("clears their old last words, so their next tag out counts on the leaderboard", async () => {
    // updateLeaderboard only runs when a last words entry is created, not overwritten
    expect((await db.doc(`lastWords/${address("p1")}`).get()).exists).toBe(false);
    expect((await db.doc(`lastWords/${address("p2")}`).get()).exists).toBe(false);
  });

  it("does nothing the second time", async () => {
    expect(await reviveVictims(address("x"))).toEqual([]);
    expect(await walkLoop("r")).toEqual(["r", "p1", "p2", "f"]);
  });
});

describe("check-in sweep", () => {
  // 2026-11-09 20:30 EST, half an hour after the deadline
  const now = Date.UTC(2026, 10, 10, 1, 30);
  afterAll(() => settingsDoc().delete());

  it("doesn't run on cached settings an admin has since changed", async () => {
    // this instance still thinks check-in is on, but an admin has just switched it off
    setCachedSettings({ ...DEFAULT_SETTINGS, checkInEnabled: true });
    await settingsDoc().set({ checkInEnabled: false });

    expect(await runCheckInSweep(now)).toEqual({ ran: false, removed: [], winner: null });
    expect((await settingsDoc().get()).data()?.lastCheckInSweepDay).toBeUndefined();
    expect((await read("one")).alive).toBe(true);
  });
});
