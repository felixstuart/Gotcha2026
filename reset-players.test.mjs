import test from "node:test";
import assert from "node:assert/strict";
import { resetPlayers } from "./reset-players.mjs";

function database() {
  const stored = {
    "data/admin@milton.edu": { role: "admin", tags: 7, firstName: "Admin" },
    "data/player@milton.edu": { role: "player" },
    "data/observer@milton.edu": { role: "observer" },
    "data/unknown@milton.edu": {},
    "lastWords/player@milton.edu": { lw: "bye" },
    "tagOutEvents/event": { active: true },
    "leaderboard/main": { topTaggers: [] },
    "lastWordsIndex/main": { version: 2 },
    "adminIndex/main": { players: { "admin@milton.edu": { role: "admin" }, "player@milton.edu": { role: "player" } } },
    "config/game": { checkInEnabled: false },
    "adminLog/entry": { action: "updateProfile" },
  };
  const writes = [];
  let writing = false;
  const snapshot = (path) => ({ id: path.split("/")[1], ref: { path }, exists: path in stored, data: () => stored[path] });
  const db = {
    stored, writes,
    collection: (path) => ({ path, collection: true }),
    doc: (path) => ({ path }),
    async runTransaction(callback) {
      const result = await callback({
        async get(ref) {
          assert.equal(writing, false, "reset must read all documents before writes");
          if (!ref.collection) return snapshot(ref.path);
          const docs = Object.keys(stored).filter((p) => p.startsWith(ref.path + "/")).map(snapshot);
          return { docs, size: docs.length };
        },
        delete(ref) { writing = true; writes.push({ path: ref.path, remove: true }); },
        set(ref, data) { writing = true; writes.push({ path: ref.path, data }); },
      });
      for (const write of writes) {
        if (write.remove) delete stored[write.path];
        else stored[write.path] = write.data;
      }
      return result;
    },
  };
  return db;
}

test("reset previews all affected data without writing", async () => {
  const db = database();
  const before = structuredClone(db.stored);
  const result = await resetPlayers(db);
  assert.equal(result.adminsKept, 1);
  assert.equal(result.nonAdminProfilesDeleted, 3);
  assert.equal(result.lastWordsDeleted, 1);
  assert.equal(result.tagOutEventsDeleted, 1);
  assert.equal(db.writes.length, 0);
  assert.deepEqual(db.stored, before);
});

test("reset clears the game but preserves exact admin profiles, settings, and logs", async () => {
  const db = database();
  const admin = structuredClone(db.stored["data/admin@milton.edu"]);
  const result = await resetPlayers(db, true);
  assert.equal(result.mode, "APPLIED");
  assert.deepEqual(db.stored["data/admin@milton.edu"], admin);
  assert.ok(!db.writes.some((w) => w.path === "data/admin@milton.edu"));
  assert.deepEqual(Object.keys(db.stored).sort(), ["data/admin@milton.edu", "adminIndex/main", "config/game", "adminLog/entry"].sort());
  assert.deepEqual(db.stored["adminIndex/main"].players, { "admin@milton.edu": { role: "admin" } });
  assert.deepEqual(db.stored["config/game"], { checkInEnabled: false });
  assert.deepEqual(db.stored["adminLog/entry"], { action: "updateProfile" });
});
