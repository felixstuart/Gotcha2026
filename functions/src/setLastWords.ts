import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const setLastWords = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const lastWords = request.data.lastWords;
  if (typeof lastWords !== "string") {
    throw new HttpsError("invalid-argument", "lastWords must be a string");
  }

  const db = getFirestore();
  const ref = db.doc(`lastWords/${request.auth.token.email}`);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Last words doc not found");
  }

  if ((snap.data() as any).lw) {
    throw new HttpsError("already-exists", "Last words already set");
  }

  await ref.update({ lw: lastWords });
  return { status: 200 };
});
