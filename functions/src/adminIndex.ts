import { Firestore, Transaction } from "firebase-admin/firestore";
import { AdminLogEntry } from "../../types";

/** The single document the admin table reads from (like leaderboard/main) */
export const ADMIN_INDEX_PATH = "adminIndex/main";

export { toAdminIndexRow } from "../../shared/admin-index.cjs";

/**
 * Adds an entry to the adminLog collection inside the caller's transaction,
 * so an admin change and its log entry are saved together or not at all.
 */
export function logAdminAction(
  db: Firestore,
  tx: Transaction,
  entry: Omit<AdminLogEntry, "at">,
) {
  tx.set(db.collection("adminLog").doc(), { ...entry, at: Date.now() });
}
