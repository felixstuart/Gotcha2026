import { Firestore, Transaction } from "firebase-admin/firestore";
import { AdminIndexRow, AdminLogEntry, Profile } from "../../types";

/** The single document the admin table reads from (like leaderboard/main) */
export const ADMIN_INDEX_PATH = "adminIndex/main";

/**
 * Turns a profile into its admin table row.
 * firestore rejects undefined values, so missing optional fields become null.
 */
export function toAdminIndexRow(profile: Profile): AdminIndexRow {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    class: profile.class,
    dayorboard: profile.dayorboard,
    role: profile.role,
    alive: profile.alive,
    tags: profile.tags,
    chaser: profile.chaser,
    targetEmail: profile.target?.email ?? "",
    lastEditedBy: profile.lastEditedBy ?? null,
    lastEditedAt: profile.lastEditedAt ?? null,
  };
}

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
