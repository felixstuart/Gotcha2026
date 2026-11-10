import { requireRegisteredSchoolUser } from "./authorization";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { ClientLastWordsResponse, LastWordsEntry } from "../../types";

export const lastWordsIndexPath = "lastWordsIndex/main";

// how many last words are shown, and how many of the latest tag outs are read to find them
const SHOWN = 10;
const RECENT_TAG_OUTS = 50;

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

    // newest first. a query can't both leave out the blank ones and sort by time (Firestore
    // sorts by the filtered field first, which made this list alphabetical), so the blank
    // ones (tagged out, nothing written yet) are dropped here instead
    const snaps = await tx.get(db
      .collection("lastWords")
      .orderBy("timestamp", "desc")
      .limit(RECENT_TAG_OUTS));

    const lastWords = (snaps.docs.map((doc) => doc.data()) as LastWordsEntry[])
      .filter((entry) => typeof entry.lw === "string" && entry.lw !== "")
      .slice(0, SHOWN);
    const result = { lastWords };
    tx.set(index, result);
    return result;
  });
});
