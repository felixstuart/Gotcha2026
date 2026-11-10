import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import firebaseFunctionsTest from "firebase-functions-test";
import { LastWordsEntry } from "../../types";
import { db } from "./firebase";
import { getLastWords, lastWordsIndexPath } from "./getLastWords";
import { setLastWords } from "./setLastWords";

const testEnv = firebaseFunctionsTest({ projectId: process.env.GCLOUD_PROJECT });
const getWords = testEnv.wrap(getLastWords);
const setWords = testEnv.wrap(setLastWords);
const email = "lastwords-test@milton.edu";
const auth = { uid: email, token: { email, email_verified: true } };
const load = () => getWords({ data: {}, auth } as any);
const entry = (lw: string, timestamp: number): LastWordsEntry => ({ lw, timestamp, author: "Test Player" });

async function seed(entries: LastWordsEntry[]) {
  const batch = db.batch();
  entries.forEach((words, i) => batch.set(db.doc(`lastWords/entry-${i}`), words));
  await batch.commit();
}

beforeAll(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("Last words tests require a local Firestore emulator");
  }
});

beforeEach(async () => {
  const batch = db.batch();
  for (const doc of (await db.collection("lastWords").get()).docs) batch.delete(doc.ref);
  batch.delete(db.doc(lastWordsIndexPath));
  batch.set(db.doc(`data/${email}`), { role: "player", alive: false });
  await batch.commit();
});

describe("newest last words", () => {
  it("selects the newest ten regardless of alphabetical order, excluding empty entries", async () => {
    const entries = Array.from({ length: 15 }, (_, i) => entry(i < 5 ? `A-old-${i}` : `Z-new-${i}`, i + 1));
    await seed([...entries, entry("", 1000)]);
    await db.doc("lastWords/missing-text").set({ author: "Test", timestamp: 2000 });
    const expected = [...entries].reverse().slice(0, 10);
    expect(await load()).toEqual({ lastWords: expected });
    expect((await db.doc(lastWordsIndexPath).get()).data()).toEqual({ lastWords: expected, version: 2 });
  });

  it("returns all available submitted entries when there are fewer than ten", async () => {
    await seed([entry("A older", 1), entry("Z newest", 2), entry("", 3)]);
    expect(await load()).toEqual({ lastWords: [entry("Z newest", 2), entry("A older", 1)] });
  });

  it("returns an empty list when nobody has submitted words", async () => {
    await seed([entry("", 1)]);
    expect(await load()).toEqual({ lastWords: [] });
  });

  it("rebuilds the old alphabetical cache without a manual database change", async () => {
    await seed([entry("Z newest", 2)]);
    await db.doc(lastWordsIndexPath).set({ lastWords: [entry("A stale cached result", 1)] });
    expect(await load()).toEqual({ lastWords: [entry("Z newest", 2)] });
    expect((await db.doc(lastWordsIndexPath).get()).data()?.version).toBe(2);
  });

  it("refreshes cached results when a player submits last words", async () => {
    await seed(Array.from({ length: 12 }, (_, i) => entry(`A-${i}`, i + 1)));
    await db.doc(`lastWords/${email}`).set(entry("", 1000));
    expect((await load()).lastWords).toHaveLength(10);
    await setWords({ data: { lastWords: "Z just submitted" }, auth } as any);
    expect((await db.doc(lastWordsIndexPath).get()).exists).toBe(false);
    const result = await load();
    expect(result.lastWords).toHaveLength(10);
    expect(result.lastWords[0]).toEqual(entry("Z just submitted", 1000));
    expect(await load()).toEqual(result); // The rebuilt cache has the same public response.
  });
});
