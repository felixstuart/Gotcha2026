import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { AdminIndex, Profile } from "../../types";
import { requireAdmin } from "./auth";
import { ADMIN_INDEX_PATH, logAdminAction, toAdminIndexRow } from "./adminIndex";

/**
 * Rebuilds adminIndex/main from scratch by reading every profile (1 read per player).
 * syncAdminIndex only reacts to new writes, so run this once before the game
 * to fill the index, or any time it looks out of sync.
 */
export const rebuildAdminIndex = onCall(async (request) => {
  const adminEmail = await requireAdmin(request);

  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    // Reading inside the transaction prevents a stale rebuild overwriting newer rows.
    const profiles = await tx.get(db.collection("data"));
    const index: AdminIndex = { players: {}, updatedAt: Date.now() };
    for (const doc of profiles.docs) index.players[doc.id] = toAdminIndexRow(doc.data() as Profile);
    tx.set(db.doc(ADMIN_INDEX_PATH), index);
    logAdminAction(db, tx, { by: adminEmail, action: "rebuildIndex", target: null });
    return { players: profiles.size };
  });
});
