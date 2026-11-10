import { requireRegisteredSchoolUser } from "./authorization";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { lastWordsIndexPath } from "./getLastWords";

// the same limit the website and apps put on the text box (lastWords.maxLength in shared/copy.json)
const MAX_LENGTH = 60;

/**
 * Sets the user's last words if they are tagging out
 * Deletes the last words index as the index will now be outdated
 */
export const setLastWords = onCall(async (request) => {
  const member = await requireRegisteredSchoolUser(request);

  const raw = request.data?.lastWords;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "lastWords must be a string");
  }
  // trimmed first, so spaces alone count as saying nothing
  const lastWords = raw.trim();
  if (lastWords.length > MAX_LENGTH) {
    throw new HttpsError("invalid-argument", `lastWords must be at most ${MAX_LENGTH} characters`);
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
