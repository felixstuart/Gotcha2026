import { requireRegisteredSchoolUser } from "./authorization";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { ClientLastWordsResponse, LastWordsEntry } from "../../types";

export const lastWordsIndexPath = "lastWordsIndex/main";
const CACHE_VERSION = 2;

/**
 * Gets the newest 10 nonempty entries by their stored tag-out timestamp.
 * Cache version 2 ignores older responses selected alphabetically.
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

    const snaps = await tx.get(db
      .collection("lastWords")
      .where("lw", "!=", "")
      .orderBy("timestamp", "desc")
      .orderBy("lw")
      .limit(10));

    const lastWords = snaps.docs.map((doc) => doc.data()) as LastWordsEntry[];
    const result = { lastWords };
    tx.set(index, { ...result, version: CACHE_VERSION });
    return result;
  });
});
