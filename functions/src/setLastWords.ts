import { requireRegisteredSchoolUser } from "./authorization";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { lastWordsIndexPath } from "./getLastWords";

/**
 * Sets the user's last words if they are tagging out
 * Deletes the last words index as the index will now be outdated
 */
export const setLastWords = onCall(async (request) => {
  const member = await requireRegisteredSchoolUser(request);

  const lastWords = request.data?.lastWords;
  if (typeof lastWords !== "string" || lastWords.length > 1000) {
    throw new HttpsError("invalid-argument", "lastWords must be a string of at most 1000 characters");
  }

  const db = getFirestore();
  const ref = db.doc(`lastWords/${member.email}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Last words doc not found");
    if (snap.data()?.lw) throw new HttpsError("already-exists", "Last words already set");
    tx.update(ref, { lw: lastWords });
    if (lastWords !== "") tx.delete(db.doc(lastWordsIndexPath));
  });
  return { status: 200 };
});
