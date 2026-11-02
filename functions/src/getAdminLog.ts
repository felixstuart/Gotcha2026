import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { AdminLogEntry } from "../../types";
import { requireAdmin } from "./auth";

/**
 * The most recent admin actions, newest first (1 read per entry returned).
 */
export const getAdminLog = onCall(async (request) => {
  requireAdmin(request);

  const db = getFirestore();
  const snaps = await db
    .collection("adminLog")
    .orderBy("at", "desc")
    .limit(50)
    .get();

  const log = snaps.docs.map((doc) => doc.data()) as AdminLogEntry[];
  return { log };
});
