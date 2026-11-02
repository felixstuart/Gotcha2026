import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Profile } from "../../types";
import { ADMIN_INDEX_PATH, toAdminIndexRow } from "./adminIndex";

/**
 * Keeps adminIndex/main in sync with the profiles, one row at a time.
 * The event already has the profile before and after the write, so this costs no reads.
 */
export const syncAdminIndex = onDocumentWritten("data/{email}", async (event) => {
  const email = event.params.email;
  const before = event.data?.before.data() as Profile | undefined;
  const after = event.data?.after.data() as Profile | undefined;

  const db = getFirestore();
  const indexRef = db.doc(ADMIN_INDEX_PATH);

  // using set + merge (instead of update) so this also works before the index exists.
  // emails contain dots, but object keys in set() aren't treated as field paths, so that's fine
  if (!after) {
    await indexRef.set({
      players: { [email]: FieldValue.delete() },
      updatedAt: Date.now(),
    }, { merge: true });
    return;
  }

  const row = toAdminIndexRow(after);

  // most profile writes are getProfile updating target.location, which isn't in the table.
  // skip those so they don't cost a write
  if (before && JSON.stringify(toAdminIndexRow(before)) === JSON.stringify(row)) {
    return;
  }

  await indexRef.set({
    players: { [email]: row },
    updatedAt: Date.now(),
  }, { merge: true });
});
