import { requireRegisteredSchoolUser } from "./authorization";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { ClientLastWordsResponse, LastWordsEntry } from "../../types";

export const lastWordsIndexPath = "lastWordsIndex/main";
const CACHE_VERSION = 3;

// Number of submitted messages shown. Blank tag-out placeholders do not use a slot.
const SHOWN = 10;

/**
 * Gets the newest 10 nonempty entries by their stored tag-out timestamp.
 * Cache version 3 reads beyond blank placeholders instead of stopping at fifty.
 */
export const getLastWords = onCall(async (request): Promise<ClientLastWordsResponse> => {
  await requireRegisteredSchoolUser(request);

  const db = getFirestore();
  const index = db.doc(lastWordsIndexPath);
  const cached = (await index.get()).data();
  if (cached?.version === CACHE_VERSION) return { lastWords: cached.lastWords };

  return db.runTransaction(async (tx) => {
    const cached = (await tx.get(index)).data();
    if (cached?.version === CACHE_VERSION) return { lastWords: cached.lastWords };

    // Scan the game roster's display collection only on a cache miss.
    // A fixed window can hide submitted words behind newer blank placeholders.
    const snaps = await tx.get(db
      .collection("lastWords")
      .orderBy("timestamp", "desc"));

    const lastWords = (snaps.docs.map((doc) => doc.data()) as LastWordsEntry[])
      .filter((entry) => typeof entry.lw === "string" && entry.lw.trim() !== "")
      .slice(0, SHOWN);
    const result = { lastWords };
    tx.set(index, { ...result, version: CACHE_VERSION });
    return result;
  });
});
