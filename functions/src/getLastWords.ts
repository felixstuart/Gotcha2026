import { requireRegisteredSchoolUser } from "./authorization";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { LastWordsEntry } from "../../types";

export const getLastWords = onCall(async (request) => {
  await requireRegisteredSchoolUser(request);

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
