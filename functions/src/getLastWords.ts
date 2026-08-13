import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { LastWordsEntry } from "../../types";

export const getLastWords = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const db = getFirestore();
  const snaps = await db
    .collection("lastWords")
    .where("lw", "!=", "")
    .orderBy("lw")
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  const lastWords = snaps.docs.map((doc) => doc.data()) as LastWordsEntry[];
  return { lastWords };
});
