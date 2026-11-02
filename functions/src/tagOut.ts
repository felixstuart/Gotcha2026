import { HttpsError, onCall } from "firebase-functions/v2/https";
import { AdminIndexRow } from "../../types";
import { getFirestore } from "firebase-admin/firestore";
import { requireAdmin } from "./auth";
import { ADMIN_INDEX_PATH, logAdminAction, toAdminIndexRow } from "./adminIndex";
import { Chain } from "./chain";

export const tagOut = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const db = getFirestore();
  let email;
  let adminEmail: string | null = null;

  if (!request.data.email) {
    email = request.auth.token.email;
  } else {
    // Make sure the requester is an admin
    // if they are requesting to tag out someone else
    adminEmail = requireAdmin(request);
    email = request.data.email;
  }

  console.log(email);

  try {
    const result = await db.runTransaction(async (tx) => {
      const chain = new Chain(db, tx);
      const user = await chain.load(email);

      // throws if they're already out (e.g. a double click), so nobody gets a tag twice.
      // their chaser now chases their target
      const { chaserEmail, winner } = await chain.remove(email);

      const chaser = await chain.load(chaserEmail);
      chaser.tags += 1;
      chain.touch(chaserEmail);

      chain.save();

      // write the changed admin table rows now (syncAdminIndex would a moment later),
      // so the admin table can show them straight away
      const rows: Record<string, AdminIndexRow> = {};
      for (const [changedEmail, profile] of chain.changed()) {
        rows[changedEmail] = toAdminIndexRow(profile);
      }
      tx.set(db.doc(ADMIN_INDEX_PATH), { players: rows, updatedAt: Date.now() }, { merge: true });

      // admins tagging someone out leave a trail in the admin log
      if (adminEmail) {
        logAdminAction(db, tx, {
          by: adminEmail,
          action: "tagOut",
          target: email,
        });
      }

      // creating this also triggers updateLeaderboard
      tx.set(db.doc(`lastWords/${email}`), {
        lw: "",
        author: `${user.firstName} ${user.lastName}`,
        timestamp: Date.now(),
      });

      return { winner, rows };
    });

    // winner is set when this tag left only one player standing.
    // rows are the admin table rows of everyone the tag changed
    return { status: 200, ...result };
  } catch (err) {
    // keep useful errors (like "already out") instead of hiding them behind a generic one
    if (err instanceof HttpsError) throw err;
    console.error("tagOut failed:", err);
    throw new HttpsError("unknown", "Tag out failed");
  }
});
