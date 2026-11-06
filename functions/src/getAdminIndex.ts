import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { AdminIndex } from "../../types";
import { requireAdmin } from "./auth";
import { ADMIN_INDEX_PATH } from "./adminIndex";

/**
 * Retrieves every player's admin table row. This reads the single adminIndex/main
 * document (kept up to date by syncAdminIndex), so it's 1 read instead of 1 per player.
 */
export const getAdminIndex = onCall(async (request) => {
  requireAdmin(request);

  const db = getFirestore();
  const indexSnap = await db.doc(ADMIN_INDEX_PATH).get();

  if (!indexSnap.exists) {
    throw new HttpsError("not-found", "No admin index found. Run rebuildAdminIndex once to create it.");
  }

  return { index: indexSnap.data() as AdminIndex };
});
