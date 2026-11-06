import { requireRegisteredSchoolUser } from "./authorization";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { ClientLastWordsResponse, LastWordsEntry } from "../../types";

export const lastWordsIndexPath = "lastWordsIndex/main";

/**
 * Gets the last 10 words (for display)
 * If the prior cache was deleted due to being outdated,
 * creates a new cache of the last 10 last words as a side effect as well.
 */
export const getLastWords = onCall(async (request): Promise<ClientLastWordsResponse> => {
  await requireRegisteredSchoolUser(request);

  const db = getFirestore();
  const index = db.doc(lastWordsIndexPath);
  const cached = await index.get();
  if (cached.exists) return cached.data() as ClientLastWordsResponse;

  return db.runTransaction(async (tx) => {
    const cached = await tx.get(index);
    if (cached.exists) return cached.data() as ClientLastWordsResponse;

    const snaps = await tx.get(db
      .collection("lastWords")
      .where("lw", "!=", "")
      .orderBy("lw")
      .orderBy("timestamp", "desc")
      .limit(10));

    const lastWords = snaps.docs.map((doc) => doc.data()) as LastWordsEntry[];
    const result = { lastWords };
    tx.set(index, result);
    return result;
  });
});
