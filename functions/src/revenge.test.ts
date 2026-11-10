import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import firebaseFunctionsTest from "firebase-functions-test";
import { Profile } from "../../types";
import { db } from "./firebase";
import { tagOut } from "./tagOut";
import { adminUpdateProfile } from "./adminUpdateProfile";
import { updateLeaderboard } from "./updateLeaderboard";
import { DEFAULT_SETTINGS, setCachedSettings } from "./settings";

const testEnv = firebaseFunctionsTest({ projectId: process.env.GCLOUD_PROJECT });
const runTagOut = testEnv.wrap(tagOut);
const runAdminUpdate = testEnv.wrap(adminUpdateProfile);
const runLeaderboard = testEnv.wrap(updateLeaderboard);
const [Q, T, F, R, V1, V2] = ["q", "tagger", "f", "r", "v1", "v2"]
  .map((name) => `revenge-${name}@milton.edu`);
const loop = [Q, T, F, R];
const victimEventIds = ["test-z-first", "test-a-second"];

async function processScore(id: string) {
  await runLeaderboard({ params: { eventId: id }, data: await db.doc(`tagOutEvents/${id}`).get() });
}

async function eventsFor(email: string) {
  return (await db.collection("tagOutEvents").where("victim", "==", email).get()).docs;
}

const target = (email: string): Profile["target"] => ({ email, firstName: email, lastName: "Test" });
const profile = (chaser: string, next: string, alive = true): Profile => ({
  alive, chaser, target: target(next), role: "player", firstName: next,
  lastName: "Test", class: "senior", dayorboard: "day", tags: 0,
});
const read = async (email: string) => (await db.doc(`data/${email}`).get()).data() as Profile;
const authFor = (email: string, admin = false) => ({
  uid: email, token: { email, email_verified: true, ...(admin && { admin: true }) },
});
const eliminate = (email: string) => runTagOut({ data: {}, auth: authFor(email) } as any);
const adminEliminate = () => runAdminUpdate({
  data: { email: T, changes: { alive: false } }, auth: authFor(Q, true),
} as any);

async function expectLoop(emails: string[]) {
  for (const [i, email] of emails.entries()) {
    const player = await read(email);
    expect(player.alive).toBe(true);
    expect(player.target.email).toBe(emails[(i + 1) % emails.length]);
    expect(player.chaser).toBe(emails[(i + emails.length - 1) % emails.length]);
  }
}

beforeAll(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("Revenge tests require a local Firestore emulator");
  }
});

beforeEach(async () => {
  setCachedSettings({ ...DEFAULT_SETTINGS, revengeEnabled: true });
  const batch = db.batch();
  for (const doc of (await db.collection("tagOutEvents").get()).docs) batch.delete(doc.ref);
  batch.set(db.doc("leaderboard/main"), { topTaggers: [], byDorms: [], byClass: [] });
  loop.forEach((email, i) => batch.set(db.doc(`data/${email}`),
    profile(loop[(i + 3) % 4], loop[(i + 1) % 4])));
  for (const [i, email] of [V1, V2].entries()) {
    batch.set(db.doc(`data/${email}`), {
      ...profile(T, F, false), activeTagOutEvent: victimEventIds[i],
    });
    // Old eliminations still qualify: revenge has no time cutoff.
    batch.set(db.doc(`lastWords/${email}`), { timestamp: i + 1 });
    batch.set(db.doc(`tagOutEvents/${victimEventIds[i]}`), {
      tagger: T, victim: email, timestamp: i + 1, active: true,
    });
  }
  await batch.commit();
});

describe("revenge during elimination", () => {
  it("revives victims in order and returns their updated rows immediately", async () => {
    const result = await eliminate(T);
    await expectLoop([Q, V1, V2, F, R]);
    expect((await read(T)).alive).toBe(false);
    expect((await read(Q)).tags).toBe(1);
    expect(result.rows[V1].alive).toBe(true);
    expect(result.rows[V2].alive).toBe(true);
    expect(result.winner).toBeNull();
    for (const id of victimEventIds) {
      expect((await db.doc(`tagOutEvents/${id}`).get()).data()?.active).toBe(false);
    }
    expect((await read(V1)).activeTagOutEvent).toBeUndefined();
    const events = await eventsFor(T);
    expect(events).toHaveLength(1);
    expect((await read(T)).activeTagOutEvent).toBe(events[0].id);
  });

  it("leaves victims out when the admin toggle is off", async () => {
    setCachedSettings({ ...DEFAULT_SETTINGS, revengeEnabled: false });
    await eliminate(T);
    await expectLoop([Q, F, R]);
    expect((await read(V1)).alive).toBe(false);
    expect((await read(V2)).alive).toBe(false);
  });

  it("handles a tagger with no victims", async () => {
    for (const id of victimEventIds) await db.doc(`tagOutEvents/${id}`).delete();
    await db.doc(`data/${V1}`).delete();
    await db.doc(`data/${V2}`).delete();
    await eliminate(T);
    await expectLoop([Q, F, R]);
  });

  it("rejects duplicate tag-outs without awarding a second tag or replaying revenge", async () => {
    const results = await Promise.allSettled([eliminate(T), eliminate(T)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "failed-precondition" },
    });
    await expectLoop([Q, V1, V2, F, R]);
    expect((await read(Q)).tags).toBe(1);
    expect(await eventsFor(T)).toHaveLength(1);
  });

  it("keeps the chain consistent when neighboring players are tagged out concurrently", async () => {
    await Promise.all([eliminate(T), eliminate(F)]);
    // If F goes first, T tagged F, so T's revenge brings F back too.
    const f = await read(F);
    await expectLoop(f.alive ? [Q, V1, V2, F, R] : [Q, V1, V2, R]);
    expect((await read(T)).alive).toBe(false);
    const tags = await Promise.all([Q, T, V2].map(async (email) => (await read(email)).tags));
    expect(tags.reduce((sum, count) => sum + count, 0)).toBe(2);
  });

  it("makes no partial changes when a relationship is broken", async () => {
    await db.doc(`data/${F}`).update({ chaser: R });
    await expect(eliminate(T)).rejects.toMatchObject({ code: "failed-precondition" });
    expect((await read(T)).alive).toBe(true);
    expect((await read(V1)).alive).toBe(false);
    expect((await read(Q)).tags).toBe(0);
    expect((await read(Q)).target.email).toBe(T);
  });

  it("does not announce a winner when revenge brings players back", async () => {
    await db.doc(`data/${Q}`).set(profile(T, T));
    await db.doc(`data/${T}`).set(profile(Q, Q));
    expect((await eliminate(T)).winner).toBeNull();
    await expectLoop([Q, V1, V2]);
  });

  it("still announces the winner when revenge is off", async () => {
    setCachedSettings({ ...DEFAULT_SETTINGS, revengeEnabled: false });
    await db.doc(`data/${Q}`).set(profile(T, T));
    await db.doc(`data/${T}`).set(profile(Q, Q));
    expect((await eliminate(T)).winner).toBe(Q);
    expect((await read(Q)).target.email).toBe("");
  });

  it("applies revenge to an admin elimination in the same transaction", async () => {
    const result = await adminEliminate();
    await expectLoop([Q, V1, V2, F, R]);
    expect(result.affected[V1].alive).toBe(true);
    expect((await read(Q)).tags).toBe(0);
  });

  it("respects the toggle for admin eliminations too", async () => {
    setCachedSettings({ ...DEFAULT_SETTINGS, revengeEnabled: false });
    await adminEliminate();
    await expectLoop([Q, F, R]);
    expect((await read(V1)).alive).toBe(false);
  });

  it("closes stale events without reviving a different elimination", async () => {
    await db.doc("tagOutEvents/test-obsolete").set({
      tagger: T, victim: V1, timestamp: 0, active: true,
    });
    await eliminate(T);
    await expectLoop([Q, V1, V2, F, R]);
    expect((await db.doc("tagOutEvents/test-obsolete").get()).data()?.active).toBe(false);
  });

  it("closes an event when an admin revives its victim", async () => {
    await runAdminUpdate({
      data: { email: V1, changes: { alive: true, chaser: Q } }, auth: authFor(Q, true),
    } as any);
    expect((await read(V1)).activeTagOutEvent).toBeUndefined();
    expect((await db.doc(`tagOutEvents/${victimEventIds[0]}`).get()).data()?.active).toBe(false);
    await eliminate(T);
    await expectLoop([Q, V1, V2, F, R]);
  });

  it("records repeat eliminations separately and counts out-of-order score deliveries once", async () => {
    const q = await read(Q);
    await eliminate(T);
    const first = (await eventsFor(T))[0];
    await runAdminUpdate({
      data: { email: T, changes: { alive: true, chaser: Q } }, auth: authFor(Q, true),
    } as any);
    // A revenge revival can leave last words behind; the next tag overwrites them.
    await db.doc(`lastWords/${T}`).set({ lw: "Previous round", author: "Test", timestamp: 0 });
    await eliminate(T);
    const events = await eventsFor(T);
    expect(events).toHaveLength(2);
    const second = events.find((doc) => doc.id !== first.id)!;
    expect(first.id).not.toBe(second.id);
    expect((await db.doc(first.ref.path).get()).data()?.active).toBe(false);
    await processScore(second.id);
    await Promise.all([processScore(first.id), processScore(first.id)]);
    const board = (await db.doc("leaderboard/main").get()).data()!;
    expect(board.topTaggers).toEqual([{ name: `${q.firstName} ${q.lastName}`, tags: 2 }]);
    expect(board.byClass).toEqual([{ class: q.class, tags: 2 }]);
    expect(board.byDorms).toEqual([{ dorm: q.dayorboard, tags: 2 }]);
  });

  it("attributes scores to the recorded tagger even if the victim's chaser changes", async () => {
    const q = await read(Q);
    await eliminate(T);
    const event = (await eventsFor(T))[0];
    await db.doc(`data/${T}`).update({ chaser: R });
    await processScore(event.id);
    expect((await db.doc("leaderboard/main").get()).data()?.topTaggers)
      .toEqual([{ name: `${q.firstName} ${q.lastName}`, tags: 1 }]);
  });

  it("does not award scores for admin removals", async () => {
    await adminEliminate();
    const event = (await eventsFor(T))[0];
    expect(event.data().score).toBeUndefined();
    await processScore(event.id);
    expect((await db.doc("leaderboard/main").get()).data()?.topTaggers).toEqual([]);
  });

  it("backfills legacy eliminations without awarding scores and is safe to rerun", async () => {
    for (const [i, email] of [V1, V2].entries()) {
      await db.doc(`tagOutEvents/${victimEventIds[i]}`).delete();
      await db.doc(`data/${email}`).update({ activeTagOutEvent: FieldValue.delete() });
    }
    const project = process.env.GCLOUD_PROJECT!;
    if (!project.startsWith("demo-")) throw new Error("Migration test requires a demo project");
    const script = resolve(__dirname, "../../scripts/backfill-tag-out-events.mjs");
    const run = promisify(execFile);
    const preview = await run(process.execPath, [script, "--project", project]);
    expect(preview.stdout).toContain("Would migrate 2");
    expect((await read(V1)).activeTagOutEvent).toBeUndefined();
    await run(process.execPath, [script, "--project", project, "--apply"]);
    const second = await run(process.execPath, [script, "--project", project, "--apply"]);
    expect(second.stdout).toContain("Migrated 0");
    expect((await db.doc(`tagOutEvents/legacy-${V1}`).get()).data()?.score).toBeUndefined();
    await eliminate(T);
    await expectLoop([Q, V1, V2, F, R]);
  }, 15000);
});
