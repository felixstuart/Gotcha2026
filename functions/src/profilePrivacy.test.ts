import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import firebaseFunctionsTest from "firebase-functions-test";
import { ClientProfile, Profile } from "../../types";
import * as authModule from "./auth";
import { db } from "./firebase";
import { getProfile } from "./getProfile";
import { DEFAULT_SETTINGS, setCachedSettings } from "./settings";
import { pointIn } from "./testBuildings";

const testEnv = firebaseFunctionsTest({ projectId: process.env.GCLOUD_PROJECT });
const run = testEnv.wrap(getProfile);
const player = "privacy-player@milton.edu";
const hunter = "privacy-hunter@milton.edu";
const target = "privacy-target@milton.edu";
const admin = "privacy-admin@milton.edu";
const auth = (email: string, isAdmin = false) => ({
  uid: email, token: { email, email_verified: true, ...(isAdmin && { admin: true }) },
});
const load = (email = player, isAdmin = false, data = {}) =>
  run({ auth: auth(email, isAdmin), data } as any) as Promise<ClientProfile | null>;
const profile: Profile = {
  alive: true, role: "player", chaser: hunter, firstName: "Player", lastName: "Test",
  class: "senior", dayorboard: "day", tags: 0,
  target: { email: target, firstName: "Target", lastName: "Test", location: "Faulkner House" },
};

beforeAll(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("Privacy tests require a local Firestore emulator");
  }
  // Token synchronization is a separate side effect; authorization still uses real hasAdminClaim.
  vi.spyOn(authModule, "syncRoleClaim").mockResolvedValue(false);
});

beforeEach(async () => {
  setCachedSettings({ ...DEFAULT_SETTINGS });
  const batch = db.batch();
  batch.set(db.doc(`data/${player}`), profile);
  batch.set(db.doc(`data/${hunter}`), { ...profile, chaser: target, target: { ...profile.target, email: player } });
  batch.set(db.doc(`data/${admin}`), { ...profile, role: "admin", alive: false });
  await batch.commit();
});

describe("profile hunter privacy", () => {
  it("omits the hunter from both the object and serialized player response", async () => {
    const response = await load();
    expect(response).not.toHaveProperty("chaser");
    expect(JSON.parse(JSON.stringify(response))).not.toHaveProperty("chaser");
    expect(response?.target.email).toBe(target);
    expect((await db.doc(`data/${player}`).get()).data()?.chaser).toBe(hunter);
  });

  it("still hides the hunter when target location is filtered", async () => {
    setCachedSettings({ ...DEFAULT_SETTINGS, seeTargetLocation: false });
    const response = await load();
    expect(response).not.toHaveProperty("chaser");
    expect(response?.target.location).toBeUndefined();
    expect((await db.doc(`data/${player}`).get()).data()?.target.location).toBe("Faulkner House");
  });

  it("still shares location and checks in without returning the hunter", async () => {
    setCachedSettings({ ...DEFAULT_SETTINGS, checkInEnabled: true });
    const response = await load(player, false, { location: pointIn("Science Building") });
    expect(response).not.toHaveProperty("chaser");
    expect(response?.location).toBe("Science Building");
    expect(response?.checkedInAt).toBeTypeOf("number");
    expect((await db.doc(`data/${hunter}`).get()).data()?.target.location).toBe("Science Building");
    expect((await db.doc(`data/${player}`).get()).data()?.chaser).toBe(hunter);
  });

  it.each([
    { alive: false }, { role: "observer" },
  ])("redacts player views regardless of stored profile state: %j", async (changes) => {
    await db.doc(`data/${player}`).update(changes);
    expect(await load()).not.toHaveProperty("chaser");
  });

  it("does not accept client-supplied flags requesting the hunter", async () => {
    expect(await load(player, false, { email: player, admin: true, includeHunter: true }))
      .not.toHaveProperty("chaser");
  });

  it("retains full profiles for admin claims on self and other-player reads", async () => {
    expect((await load(admin, true))?.chaser).toBe(hunter);
    const response = await load(admin, true, { email: player });
    expect(response?.chaser).toBe(hunter);
    expect(response?.target.location).toBe("Faulkner House");
  });

  it("continues denying cross-player reads to non-admin callers", async () => {
    await expect(load(player, false, { email: hunter })).rejects.toMatchObject({ code: "permission-denied" });
  });
});
