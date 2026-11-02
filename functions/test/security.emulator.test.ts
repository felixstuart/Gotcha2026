import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "demo-gotcha-security";
const app = initializeApp({ projectId }, "security-tests");
const db = getFirestore(app);
const auth = getAuth(app);
const tokens: Record<string, string> = {};
const student = "student@milton.edu";
const chaser = "chaser@milton.edu";
const target = "target@milton.edu";

async function call(name: string, token?: string, data: unknown = {}) {
  const response = await fetch(`http://127.0.0.1:15001/${projectId}/us-central1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  // Fail closed: this suite must never use a real Firebase project or database.
  for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] ?? "")) {
      throw new Error(`Run test:security:emulator: ${key} must point to localhost`);
    }
  }
  const users = [
    [student, true], [chaser, true], [target, true],
    ["admin@milton.edu", true], ["outsider@example.com", true],
    ["unverified@milton.edu", false], ["unregistered@milton.edu", true],
  ] as const;
  for (const [email, emailVerified] of users) {
    await auth.createUser({ email, emailVerified, password: "emulator-test-only-password" });
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "emulator-test-only-password", returnSecureToken: true }),
    });
    const result = await response.json() as { idToken?: string };
    if (!response.ok || !result.idToken) throw new Error(`Emulator login failed for ${email}`);
    tokens[email] = result.idToken;
  }
  const batch = db.batch();
  for (const [email, prev, next] of [[student, chaser, target], [chaser, target, student], [target, student, chaser]]) {
    batch.set(db.doc(`data/${email}`), {
      role: "player", alive: true, firstName: email.split("@")[0], lastName: "Test",
      chaser: prev, target: { email: next, firstName: "Test", lastName: "Student" },
      class: "junior", dayorboard: "day", tags: 0,
    });
  }
  batch.set(db.doc("data/admin@milton.edu"), { role: "admin", firstName: "Admin" });
  // Membership alone must not bypass the verified-school-account requirement.
  batch.set(db.doc("data/outsider@example.com"), { role: "player" });
  batch.set(db.doc("data/unverified@milton.edu"), { role: "player" });
  batch.set(db.doc("leaderboard/main"), { topTaggers: [], byClass: [], byDorms: [] });
  await batch.commit();
}, 30000);

afterAll(async () => { await deleteApp(app); });

describe("real Firebase security boundaries", () => {
  it("rejects unauthenticated calls", async () => {
    const result = await call("getProfile");
    expect(result.body.error.status).toBe("PERMISSION_DENIED");
  });
  it.each(["outsider@example.com", "unverified@milton.edu", "unregistered@milton.edu"])("rejects %s across student-data endpoints", async (email) => {
    for (const name of ["getProfile", "getLastWords", "getLeaderboard", "tagOut", "setLastWords"]) {
      const result = await call(name, tokens[email]);
      expect(result.body.error?.status, name).toBe("PERMISSION_DENIED");
    }
  });
  it("allows a registered student to read their own profile", async () => {
    const result = await call("getProfile", tokens[student]);
    expect(result.status).toBe(200);
    expect(result.body.result.firstName).toBe("student");
  });
  it("denies cross-student reads but allows the administrator", async () => {
    const denied = await call("getProfile", tokens[student], { email: target });
    expect(denied.body.error.status).toBe("PERMISSION_DENIED");
    const allowed = await call("getProfile", tokens["admin@milton.edu"], { email: target });
    expect(allowed.body.result.firstName).toBe("target");
  });
  it("denies direct Firestore reads and role escalation for clients, including admins", async () => {
    for (const token of [undefined, tokens[student], tokens["admin@milton.edu"]]) {
      const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/data/${student}`;
      const headers = { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) };
      expect((await fetch(url, { headers })).status).toBe(403);
      expect((await fetch(url, {
        method: "PATCH", headers,
        body: JSON.stringify({ fields: { role: { stringValue: "admin" } } }),
      })).status).toBe(403);
    }
    expect((await db.doc(`data/${student}`).get()).data()?.role).toBe("player");
  });
  it("rejects cross-student mutations and invalid location input", async () => {
    expect((await call("tagOut", tokens[student], { email: target })).body.error.status).toBe("PERMISSION_DENIED");
    expect((await call("getProfile", tokens[student], { location: [null, null] })).body.error.status).toBe("INVALID_ARGUMENT");
    expect((await call("getProfile", tokens["admin@milton.edu"], { email: target, location: [42, -71] })).body.error.status).toBe("PERMISSION_DENIED");
  });
  it("allows exactly one concurrent tag-out and prevents replayed score changes", async () => {
    const results = await Promise.all([call("tagOut", tokens[student]), call("tagOut", tokens[student])]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.find((r) => r.status !== 200)?.body.error.status).toBe("FAILED_PRECONDITION");
    const replay = await call("tagOut", tokens[student]);
    expect(replay.body.error.status).toBe("FAILED_PRECONDITION");
    expect((await db.doc(`data/${chaser}`).get()).data()?.tags).toBe(1);
    expect((await db.doc(`data/${student}`).get()).data()?.alive).toBe(false);
    expect((await db.doc(`data/${target}`).get()).data()?.chaser).toBe(chaser);
  }, 30000);
  it("allows exactly one concurrent last-words submission", async () => {
    const results = await Promise.all([
      call("setLastWords", tokens[student], { lastWords: "First" }),
      call("setLastWords", tokens[student], { lastWords: "Second" }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.find((r) => r.status !== 200)?.body.error.status).toBe("ALREADY_EXISTS");
    expect(["First", "Second"]).toContain((await db.doc(`lastWords/${student}`).get()).data()?.lw);
  }, 30000);
});
