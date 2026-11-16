import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildGame, importGame } from "./load-people.mjs";

test("normalizes the roster and creates one reciprocal cycle visiting every player", () => {
  const roster = "\uFEFF# Players\r\nALEX_CHEN27@milton.edu\r\njordan_lee28@milton.edu\n\nsam_taylor29@milton.edu\nalex_chen27@milton.edu\n";
  for (let trial = 0; trial < 20; trial++) {
    const { profiles, leaderboard } = buildGame(roster, 2027);
    assert.equal(profiles.length, 3);
    const byEmail = new Map(profiles.map((p) => [p.email, p.profile]));
    let email = profiles[0].email;
    const visited = new Set();
    while (!visited.has(email)) {
      visited.add(email);
      const profile = byEmail.get(email);
      assert.notEqual(profile.target.email, email);
      assert.equal(byEmail.get(profile.target.email).chaser, email);
      assert.equal(byEmail.get(profile.chaser).target.email, email);
      assert.equal(profile.tags, 0);
      assert.equal(profile.alive, true);
      assert.equal(profile.role, "player");
      email = profile.target.email;
    }
    assert.equal(email, profiles[0].email);
    assert.equal(visited.size, profiles.length);
    assert.equal(byEmail.get("alex_chen27@milton.edu").class, "senior");
    assert.equal(byEmail.get("jordan_lee28@milton.edu").class, "junior");
    assert.equal(leaderboard.topTaggers.length, 3);
    assert.ok(leaderboard.topTaggers.every((p) => p.tags === 0));
  }
});

test("file order is available, full graduation years parse, and unknown details stay unknown", () => {
  const { profiles } = buildGame("a_test2027@milton.edu\nb_test@milton.edu", 2027, false);
  assert.equal(profiles[0].email, "a_test2027@milton.edu");
  assert.equal(profiles[0].profile.lastName, "Test");
  assert.equal(profiles[0].profile.class, "senior");
  assert.equal(profiles[1].profile.class, "unknown");
  assert.equal(profiles[1].profile.dayorboard, "unknown");
});

test("rejects invalid input before writes and enforces the atomic import size", () => {
  for (const text of ["", "a@milton.edu\na@milton.edu", "a@milton.edu\nb@example.com", "a@milton.edu\nb/c@milton.edu"]) {
    assert.throws(() => buildGame(text, 2027));
  }
  const roster = Array.from({ length: 2001 }, (_, i) => `player${i}@milton.edu`);
  assert.equal(buildGame(roster.slice(0, 2000).join("\n"), 2027).profiles.length, 2000);
  assert.throws(() => buildGame(roster.join("\n"), 2027), /2000/);
});

const csvHeader = "Last,First,Class,DayDorm,Email";
test("CSV preserves names, normalizes classes and dorms, and builds matching targets and leaderboard", () => {
  const csv = '\uFEFF' + csvHeader + '\r\n"Van Dyke, Jr.","Alex ""Ace""",Class I,Day Student,ALEX@milton.edu\r\nLee,Jordan,Class IV,Goodwin House,jordan@milton.edu\r\nWu,Isaac,Class II,Wolcott House,isaac@milton.edu\r\nChen,Sam,Class III,,sam@milton.edu\r\n';
  const { profiles, leaderboard } = buildGame(csv, 2027, false);
  assert.deepEqual(profiles.map(({ profile: p }) => p.class), ["senior", "freshman", "junior", "sophomore"]);
  assert.deepEqual(profiles.map(({ profile: p }) => p.dayorboard), ["day", "goodwin", "wolcott", "unknown"]);
  assert.equal(profiles[0].profile.firstName, 'Alex "Ace"');
  assert.equal(profiles[0].profile.lastName, "Van Dyke, Jr.");
  const byEmail = new Map(profiles.map((p) => [p.email, p.profile]));
  for (const { email, profile: p } of profiles) {
    assert.equal(byEmail.get(p.target.email).chaser, email);
    assert.equal(p.target.firstName, byEmail.get(p.target.email).firstName);
    assert.equal(p.target.lastName, byEmail.get(p.target.email).lastName);
  }
  assert.deepEqual(leaderboard.byDorms, ["day", "goodwin", "wolcott", "unknown"].map((dorm) => ({ dorm, tags: 0 })));
  assert.deepEqual(leaderboard.topTaggers.map((p) => p.email), profiles.map((p) => p.email).sort((a, b) => a.localeCompare(b)));
});

test("CSV supports reordered headers, HTML spaces, blank metadata, multiline quoted names and identical duplicates", () => {
  const csv = 'Email,DayDorm,Class,First,Last,Extra\nA@milton.edu,Goodwin House&#x20;,Class IV,Alex,Chen,ignored\na@milton.edu,Goodwin House&#x20;,Class IV,Alex,Chen,ignored\nb@milton.edu,,,Jordan,"Lee\nSmith",ignored';
  const { profiles } = buildGame(csv, 2027, false);
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].profile.class, "freshman");
  assert.equal(profiles[0].profile.dayorboard, "goodwin");
  assert.equal(profiles[1].profile.class, "unknown");
  assert.equal(profiles[1].profile.lastName, "Lee Smith");
});

test("CSV rejects malformed records, headers, invalid metadata, emails and conflicting duplicates", () => {
  const valid = "Chen,Alex,Class I,Day Student,a@milton.edu";
  for (const csv of [
    "First,Last,Email\nAlex,Chen,a@milton.edu",
    csvHeader + ",Email\n" + valid + ",a@milton.edu",
    csvHeader + "\n" + valid + "\nLee,Jordan,Class V,Goodwin House,b@milton.edu",
    csvHeader + "\n" + valid + "\nLee,Jordan,Class IV,Typo House,b@milton.edu",
    csvHeader + "\n" + valid + "\nLee,Jordan,Class IV,Day Student,b@example.com",
    csvHeader + "\n" + valid + "\nLee,Jordan,Class IV,Day Student,a@milton.edu",
    csvHeader + "\n" + valid + "\nLee,,Class IV,Day Student,b@milton.edu",
    csvHeader + "\n" + valid + "\nLee,Jordan",
    csvHeader + '\n"unclosed',
    csvHeader + '\n"Lee"oops,Jordan,Class I,Day Student,b@milton.edu',
  ]) assert.throws(() => buildGame(csv, 2027));
});


test("CSV accepts all nine Milton houses with or without House, in any capitalization", () => {
  const houses = ["Academy", "Forbes", "Goodwin", "Hallowell", "Hathaway", "Millet", "Norris", "Robbins", "Wolcott"];
  for (const suffix of [" House", ""]) {
    const rows = houses.map((house, i) => `Player,Test,Class III,${(house + suffix).toUpperCase()},player${i}@milton.edu`);
    const { profiles, leaderboard } = buildGame([csvHeader, ...rows].join("\n"), 2027, false);
    assert.deepEqual(profiles.map(({ profile }) => profile.dayorboard), houses.map((house) => house.toLowerCase()));
    assert.deepEqual(leaderboard.byDorms, houses.map((house) => ({ dorm: house.toLowerCase(), tags: 0 })));
  }
});


test("production CLI validates the whole CSV before Firebase setup or writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "gotcha-roster-"));
  try {
    const file = join(dir, "invalid.csv");
    writeFileSync(file, csvHeader + "\nChen,Alex,Class I,Day Student,a@milton.edu\nLee,Jordan,Class II,Typo House,b@milton.edu");
    // Both Firebase settings are intentionally invalid: validation must fail first.
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./load-people.mjs", import.meta.url)), "--file", file, "--production", "--project", "demo-invalid"], {
      encoding: "utf8",
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: "invalid", GOOGLE_APPLICATION_CREDENTIALS: join(dir, "nonexistent.json") },
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CSV record 3: unrecognized DayDorm Typo House/);
    assert.doesNotMatch(result.stderr, /Production requires|credential|PERMISSION_DENIED/);
    assert.doesNotMatch(result.stdout, /Loaded/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


function importDatabase(existing, leaderboard = false, lastWords = false) {
  const writes = [];
  let writing = false;
  return {
    writes,
    doc: (path) => ({ path }),
    collection: (path) => ({ path, limit() { return this; } }),
    async runTransaction(callback) {
      await callback({
        async get(ref) {
          assert.equal(writing, false, "all reads precede writes");
          if (ref.path === "data") return { docs: Object.entries(existing).map(([id, data]) => ({ id, data: () => data })) };
          if (ref.path === "leaderboard/main") return { exists: leaderboard };
          if (ref.path === "lastWords") return { empty: !lastWords };
          throw new Error(`Unexpected read ${ref.path}`);
        },
        create(ref, data) { writing = true; writes.push({ path: ref.path, data, merge: false }); },
        set(ref, data, options) { writing = true; writes.push({ path: ref.path, data, merge: options?.merge ?? false }); },
      });
    },
  };
}

test("import preserves admin access and excludes all admins from game links", async () => {
  const game = buildGame("admin@milton.edu\nplayer@milton.edu\nsecond@milton.edu", 2027, false);
  const db = importDatabase({ "admin@milton.edu": { role: "admin" }, "outside@milton.edu": { role: "admin" } });
  await importGame(db, game);
  assert.equal(db.writes.length, 6);
  const admin = db.writes.find((w) => w.path === "data/admin@milton.edu");
  assert.equal(admin.data.role, "admin");
  assert.equal(admin.merge, true);
  assert.equal(db.writes.find((w) => w.path === "data/player@milton.edu").data.role, "player");
  for (const email of ["admin@milton.edu", "outside@milton.edu"]) {
    const saved = db.writes.find((w) => w.path === `data/${email}`).data;
    assert.equal(saved.alive, false);
    assert.equal(saved.chaser, "none");
    assert.equal(saved.target.email, "");
  }
  const player = db.writes.find((w) => w.path === "data/player@milton.edu").data;
  const second = db.writes.find((w) => w.path === "data/second@milton.edu").data;
  assert.equal(player.target.email, "second@milton.edu");
  assert.equal(player.chaser, "second@milton.edu");
  assert.equal(second.target.email, "player@milton.edu");
  assert.equal(second.chaser, "player@milton.edu");
  const board = db.writes.find((w) => w.path === "leaderboard/main").data;
  assert.deepEqual(board.topTaggers.map((p) => p.email), ["player@milton.edu", "second@milton.edu"]);
  assert.equal(game.profiles[0].profile.role, "player", "transaction retries do not mutate the plan");
});

test("preserving admins still refuses existing games without scheduling writes", async () => {
  const game = buildGame("a@milton.edu\nb@milton.edu", 2027, false);
  for (const db of [
    importDatabase({ "a@milton.edu": { role: "admin" }, "b@milton.edu": { role: "player" } }),
    importDatabase({ "a@milton.edu": { role: "observer" } }),
    importDatabase({ "a@milton.edu": {} }),
    importDatabase({ "a@milton.edu": { role: "admin" } }, true),
    importDatabase({}, false, true),
  ]) {
    await assert.rejects(importGame(db, game), /Existing game found/);
    assert.equal(db.writes.length, 0);
  }
});

test("fresh imports never automatically grant Isaac or Felix admin", async () => {
  const game = buildGame("isaac_wu28@milton.edu\nfelix_stuart27@milton.edu", 2027, false);
  const db = importDatabase({});
  await importGame(db, game);
  assert.equal(db.writes.length, 4);
  assert.ok(db.writes.filter((w) => w.path.startsWith("data/")).every((w) => w.data.role === "player" && !w.merge));
});


test("2000-member CSV produces one complete loop and one transaction with preserved admins", async () => {
  const rows = Array.from({ length: 2000 }, (_, i) => `Player${i},Test,Class III,Day Student,player${i}@milton.edu`);
  const game = buildGame([csvHeader, ...rows].join("\n"), 2027, false);
  const byEmail = new Map(game.profiles.map(({ email, profile }) => [email, profile]));
  const visited = new Set();
  let email = game.profiles[0].email;
  while (!visited.has(email)) {
    visited.add(email);
    const profile = byEmail.get(email);
    assert.equal(byEmail.get(profile.target.email).chaser, email);
    email = profile.target.email;
  }
  assert.equal(visited.size, 2000);
  assert.equal(email, game.profiles[0].email);
  const db = importDatabase({ "player0@milton.edu": { role: "admin" } });
  const run = db.runTransaction.bind(db);
  let transactions = 0;
  db.runTransaction = async (callback) => { transactions++; return run(callback); };
  await importGame(db, game);
  assert.equal(transactions, 1);
  assert.equal(db.writes.length, 2002);
  assert.equal(db.writes.find((w) => w.path === "data/player0@milton.edu").data.role, "admin");
  assert.equal(db.writes.filter((w) => w.path.startsWith("data/")).length, 2000);
  assert.equal(db.writes.filter((w) => w.path === "leaderboard/main").length, 1);
  assert.throws(() => buildGame([csvHeader, ...rows, "Extra,Test,Class I,Day Student,extra@milton.edu"].join("\n"), 2027), /Maximum 2000/);
});


test("fewer than two non-admin players fails before any writes", async () => {
  const game = buildGame("admin@milton.edu\nplayer@milton.edu", 2027, false);
  const db = importDatabase({ "admin@milton.edu": { role: "admin" } });
  await assert.rejects(importGame(db, game), /at least two non-admin/);
  assert.equal(db.writes.length, 0);
});

 test("public initial rankings are independent of private loop order", () => {
  const emails = Array.from({ length: 20 }, (_, i) => `player${String(i).padStart(2, "0")}@milton.edu`);
  const forward = buildGame(emails.join("\n"), 2027, false);
  const reverse = buildGame([...emails].reverse().join("\n"), 2027, false);
  assert.deepEqual(forward.leaderboard.topTaggers, reverse.leaderboard.topTaggers);
  assert.deepEqual(forward.leaderboard.topTaggers.map(p => p.email), emails.slice(0, 10));
  assert.notEqual(forward.profiles[0].profile.target.email, reverse.profiles.at(-1).profile.target.email);
 });
