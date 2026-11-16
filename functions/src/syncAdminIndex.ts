import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";
import { AdminIndex, Profile } from "../../types";
import { ADMIN_INDEX_PATH, toAdminIndexRow } from "./adminIndex";

/**
 * Events can arrive late, twice, or out of order (especially during reset/reseed).
 * Reconcile the CURRENT profile and index in a transaction. Never replay the event's
 * old contents. Reads also let imports skip thousands of redundant index writes.
 */
export const syncAdminIndex = onDocumentWritten(
  { document: "data/{email}", retry: true },
  async (event) => {
    const email = event.params.email;
    const db = getFirestore();
    const indexRef = db.doc(ADMIN_INDEX_PATH);
    await db.runTransaction(async (tx) => {
      const profile = (await tx.get(db.doc(`data/${email}`))).data() as Profile | undefined;
      // Read only this email’s projection, not the entire roster on every event.
      const [indexSnapshot] = await tx.getAll(indexRef, { fieldMask: [new FieldPath("players", email)] });
      const index = indexSnapshot.data() as AdminIndex | undefined;
      const existing = index?.players?.[email];
      const row = profile ? toAdminIndexRow(profile) : undefined;
      if (!row && !existing) return;
      if (row && existing && Object.entries(row).every(([key, value]) =>
        existing[key as keyof typeof existing] === value)) return;
      tx.set(indexRef, {
        players: { [email]: row ?? FieldValue.delete() }, updatedAt: Date.now(),
      }, { merge: true });
    });
  },
);
