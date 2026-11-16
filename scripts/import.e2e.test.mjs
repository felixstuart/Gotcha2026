import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const project = "demo-gotcha-import";
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host !== "127.0.0.1:18081" || process.env.GCLOUD_PROJECT !== project) {
  throw new Error("E2E tests require isolated demo-gotcha-import on 127.0.0.1:18081; refusing other databases");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const functionsTest = require("firebase-functions-test")({ projectId: project });
const sync = require("../functions/lib/functions/src/syncAdminIndex.js").syncAdminIndex.run;
const updateProfile = functionsTest.wrap(require("../functions/lib/functions/src/adminUpdateProfile.js").adminUpdateProfile);
const rebuildIndex = functionsTest.wrap(require("../functions/lib/functions/src/rebuildAdminIndex.js").rebuildAdminIndex);
const getIndex = functionsTest.wrap(require("../functions/lib/functions/src/getAdminIndex.js").getAdminIndex);
const { toAdminIndexRow } = require("../functions/lib/functions/src/adminIndex.js");
const app = initializeApp({ projectId: project }, "import-e2e");
const db = getFirestore(app);
const run = promisify(execFile);
const env = { ...process.env, GCLOUD_PROJECT: project, FIRESTORE_EMULATOR_HOST: host };
const cli = (script, args = []) => run(process.execPath, [resolve(root, script), ...args, "--project", project], { cwd: root, env, maxBuffer: 8 * 1024 * 1024 });
const admin = "admin@milton.edu";
const auth = { uid: admin, token: { email: admin, email_verified: true, admin: true } };
const docEvent = (email, before, after) => ({ params: { email }, data: { before: { data: () => before }, after: { data: () => after } } });
async function wipe() {
  const response = await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  assert.equal(response.ok, true);
}
async function dataMap() { return new Map((await db.collection("data").get()).docs.map((d) => [d.id, d.data()])); }
async function assertComplete(expectedEmails, adminEmails) {
  const data = await dataMap();
  assert.deepEqual([...data.keys()].sort(), [...expectedEmails].sort(), "every CSV member and preexisting admin has a document");
  const players = [...data].filter(([, p]) => p.role === "player");
  assert.equal(players.length, expectedEmails.length - adminEmails.length);
  let current = players[0][0]; const visited = new Set();
  while (!visited.has(current)) {
    const p = data.get(current);
    assert.equal(p?.role, "player", "chain must never enter an admin");
    assert.equal(p.alive, true);
    assert.equal(data.get(p.target.email)?.chaser, current, "target must point back");
    assert.equal(data.get(p.chaser)?.target.email, current, "chaser must point forward");
    visited.add(current); current = p.target.email;
  }
  assert.equal(current, players[0][0]);
  assert.equal(visited.size, players.length, "all players must belong to the same cycle");
  for (const email of adminEmails) {
    assert.equal(data.get(email).role, "admin"); assert.equal(data.get(email).alive, false);
    assert.equal(data.get(email).chaser, "none"); assert.equal(data.get(email).target.email, "");
  }
  const response = await getIndex({ data: {}, auth });
  assert.deepEqual(Object.keys(response.index.players).sort(), [...data.keys()].sort(), "admin API must show everyone immediately");
  for (const [email, p] of data) assert.deepEqual(response.index.players[email], toAdminIndexRow(p));
  const board = (await db.doc("leaderboard/main").get()).data();
  assert.ok(board.topTaggers.every((p) => !adminEmails.includes(p.email)));
  console.log(`Verified ${data.size} records, ${players.length} players in one reciprocal loop, ${adminEmails.length} inactive admins, ${Object.keys(response.index.players).length} matching admin rows.`);
  return data;
}

test("stale reset deletion must not remove a freshly reseeded player from the admin view", async () => {
  await wipe();
  const email = "z_test@milton.edu";
  const old = { role: "player", alive: true, firstName: "Old" };
  const fresh = { role: "player", alive: true, firstName: "Fresh", chaser: "a_test@milton.edu", target: { email: "a_test@milton.edu" } };
  await db.doc(`data/${email}`).set(fresh);
  await sync(docEvent(email, undefined, fresh));
  await sync(docEvent(email, old, undefined)); // reset event arrives AFTER reseeding
  assert.deepEqual((await db.doc("adminIndex/main").get()).data().players[email], toAdminIndexRow(fresh));
  await sync(docEvent(email, undefined, old)); // old creation/update is also delayed
  assert.deepEqual((await db.doc("adminIndex/main").get()).data().players[email], toAdminIndexRow(fresh));
  const unchanged = (await db.doc("adminIndex/main").get()).updateTime;
  await sync(docEvent(email, undefined, fresh));
  assert.ok((await db.doc("adminIndex/main").get()).updateTime.isEqual(unchanged), "duplicate events need no index write");
  await db.doc(`data/${email}`).delete();
  await sync(docEvent(email, undefined, fresh)); // delayed creation after a real deletion
  assert.equal((await db.doc("adminIndex/main").get()).data().players[email], undefined);
});

test("CLI CSV -> saved database -> admin API -> reset -> reseed, at 2000 members", { timeout: 180000 }, async () => {
  await wipe();
  const temp = await mkdtemp(join(tmpdir(), "gotcha-roster-e2e-"));
  try {
    const adminEmails = [admin, "felix_test@milton.edu", "isaac_test@milton.edu", "h_admin@milton.edu", "z_admin@milton.edu"];
    const outsideAdmin = "outside_admin@milton.edu";
    const players = Array.from({ length: 1995 }, (_, i) => ({ email: `${String.fromCharCode(97 + i % 26)}_player${i}@milton.edu`, first: `First${i}`, last: `Last${i}` }));
    const rows = [...players.map((p, i) => [p.last, p.first, ["Class I", "Class II", "Class III", "Class IV"][i % 4], i % 2 ? "Hathaway House" : "Day Student", p.email]), ...adminEmails.map((e) => ["Admin", "Test", "Class I", "Day Student", e])];
    const quote = (s) => `"${s.replaceAll('"', '""')}"`;
    const csv = "\uFEFFLast,First,Class,DayDorm,Email\r\n" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const file = join(temp, "roster.csv"); await writeFile(file, csv);
    const batch = db.batch();
    for (const email of [...adminEmails, outsideAdmin]) batch.set(db.doc(`data/${email}`), { role: "admin", alive: true, chaser: "stale@milton.edu", target: { email: "stale@milton.edu" }, firstName: "Admin", lastName: "Test" });
    await batch.commit();
    const invalid = join(temp, "invalid.csv"); await writeFile(invalid, csv + '\r\nBad,Row,Class V,Day Student,bad@milton.edu');
    await assert.rejects(cli("load-people.mjs", ["--file", invalid]), /unrecognized Class/);
    assert.equal((await dataMap()).size, 6, "validation failure must write nothing");
    await cli("load-people.mjs", ["--file", file, "--dry-run"]);
    assert.equal((await dataMap()).size, 6, "dry run must write nothing");
    await cli("load-people.mjs", ["--file", file]);
    adminEmails.push(outsideAdmin);
    const expected = [...players.map((p) => p.email), ...adminEmails];
    const first = await assertComplete(expected, adminEmails);
    await assert.rejects(updateProfile({ data: { email: admin, changes: { alive: true } }, auth }), { code: "failed-precondition" });
    await assert.rejects(updateProfile({ data: { email: players[0].email, changes: { chaser: admin } }, auth }), { code: "failed-precondition" });
    await assertComplete(expected, adminEmails);
    for (const p of players) { assert.equal(first.get(p.email).firstName, p.first); assert.equal(first.get(p.email).lastName, p.last); }
    await assert.rejects(cli("load-people.mjs", ["--file", file]), /Existing game/);
    await cli("reset-players.mjs"); assert.equal((await dataMap()).size, 2001);
    await cli("reset-players.mjs", ["--apply"]); assert.equal((await dataMap()).size, 6);
    await cli("load-people.mjs", ["--file", file, "--keep-order"]);
    const second = await assertComplete(expected, adminEmails);
    // Force out-of-order reset/old import events for names after H and admin metadata.
    for (const email of [players[8].email, players[25].email, admin]) {
      await sync(docEvent(email, first.get(email), undefined));
      await sync(docEvent(email, undefined, first.get(email)));
    }
    await assertComplete(expected, adminEmails);
    assert.equal(second.get(players.at(-1).email).target.email, players[0].email);
    // Recover an already-incomplete production-style view through the actual admin callable.
    await db.doc("adminIndex/main").set({ players: { [admin]: toAdminIndexRow(second.get(admin)) }, updatedAt: 0 });
    assert.equal((await rebuildIndex({ data: {}, auth })).players, expected.length);
    await assertComplete(expected, adminEmails);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("large admin maps are exempt from automatic field indexing", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile(resolve(root, "firestore.indexes.json"), "utf8"));
  assert.ok(config.fieldOverrides.some((entry) => entry.collectionGroup === "adminIndex" && entry.fieldPath === "players" && entry.indexes.length === 0));
});

test.after(async () => { await wipe(); functionsTest.cleanup(); await deleteApp(app); });
