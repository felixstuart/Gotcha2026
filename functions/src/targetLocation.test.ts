import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Profile } from "../../types";
import { Chain } from "./chain";
import { db } from "./firebase";
import { updateChaserTargetLocation } from "./getProfile";
import { pointIn } from "./testBuildings";

const loop = ["a", "b", "c", "d"].map((id) => `location-${id}@milton.edu`);
const [A, B, C, D] = loop;
const position = pointIn("Science Building");
const read = async (email: string) => (await db.doc(`data/${email}`).get()).data() as Profile;

beforeAll(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("Location tests require a local Firestore emulator");
  }
});

beforeEach(async () => {
  const batch = db.batch();
  loop.forEach((email, i) => batch.set(db.doc(`data/${email}`), {
    alive: true, role: "player", firstName: email, lastName: "Test",
    class: "senior", dayorboard: "day", tags: 0,
    chaser: loop[(i + 3) % 4],
    target: {
      email: loop[(i + 1) % 4], firstName: "Target", lastName: "Test", location: "Faulkner House",
    },
  }));
  await batch.commit();
});

describe("transactional target location", () => {
  it("updates only the current chaser's target location", async () => {
    expect(await updateChaserTargetLocation(B, position)).toBe("Science Building");
    expect((await read(A)).target.location).toBe("Science Building");
    expect((await read(C)).target.location).toBe("Faulkner House");
    expect((await read(B)).location).toBeUndefined();
  });

  it("uses the current chaser after a chain move", async () => {
    await db.runTransaction(async (tx) => {
      const chain = new Chain(db, tx);
      await chain.moveAfter(B, C);
      chain.save();
    });
    await updateChaserTargetLocation(B, position);
    expect((await read(C)).target).toMatchObject({ email: B, location: "Science Building" });
    expect((await read(A)).target).toMatchObject({ email: C, location: "Faulkner House" });
  });

  it("does not write when the chaser now targets someone else", async () => {
    await db.doc(`data/${A}`).update({ "target.email": C });
    await updateChaserTargetLocation(B, position);
    expect((await read(A)).target).toMatchObject({ email: C, location: "Faulkner House" });
  });

  it.each([
    { alive: false }, { role: "observer" }, { chaser: "none" },
  ])("skips an ineligible caller: %j", async (changes) => {
    await db.doc(`data/${B}`).update(changes);
    await updateChaserTargetLocation(B, position);
    expect((await read(A)).target.location).toBe("Faulkner House");
  });

  it("skips a dead chaser", async () => {
    await db.doc(`data/${A}`).update({ alive: false });
    await updateChaserTargetLocation(B, position);
    expect((await read(A)).target.location).toBe("Faulkner House");
  });

  it("handles missing profiles without writing to an unrelated player", async () => {
    await db.doc(`data/${A}`).delete();
    await updateChaserTargetLocation(B, position);
    await db.doc(`data/${B}`).delete();
    await updateChaserTargetLocation(B, position);
    expect((await read(C)).target.location).toBe("Faulkner House");
  });

  it("does not update location outside the configured buildings", async () => {
    expect(await updateChaserTargetLocation(B, [42.30000, -71.10000])).toBeNull();
    expect((await read(A)).target.location).toBe("Faulkner House");
  });

  it("does not overwrite another target's building during a concurrent chain move", async () => {
    await Promise.all([
      updateChaserTargetLocation(B, position),
      db.runTransaction(async (tx) => {
        const chain = new Chain(db, tx);
        await chain.moveAfter(B, C);
        chain.save();
      }),
    ]);
    expect((await read(A)).target).toMatchObject({ email: C, location: "Faulkner House" });
    for (const [email, next] of [[A, C], [C, B], [B, D], [D, A]]) {
      expect((await read(email)).target.email).toBe(next);
      expect((await read(next)).chaser).toBe(email);
    }
  });
});
