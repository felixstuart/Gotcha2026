import test from "node:test";
import assert from "node:assert/strict";
import { buildGame } from "./load-people.mjs";

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
  const roster = Array.from({ length: 500 }, (_, i) => `player${i}@milton.edu`);
  assert.equal(buildGame(roster.slice(0, 499).join("\n"), 2027).profiles.length, 499);
  assert.throws(() => buildGame(roster.join("\n"), 2027), /499/);
});
