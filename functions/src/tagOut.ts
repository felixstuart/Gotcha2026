import { requireRegisteredSchoolUser, requestedEmail } from "./authorization";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { AdminIndexRow } from "../../types";
import { getFirestore } from "firebase-admin/firestore";
import { lastWordsIndexPath } from "./getLastWords";
import { ADMIN_INDEX_PATH, logAdminAction, toAdminIndexRow } from "./adminIndex";
import { Chain } from "./chain";
import { reviveVictims } from "./revenge";
import { recordTagOut } from "./tagOutEvents";
import { gamePhase, getSettings } from "./settings";

export const tagOut = onCall(async (request) => {
  const member = await requireRegisteredSchoolUser(request);
  // the roster role, not the token claim, which can outlive a demotion (see requireAdmin)
  const isAdmin = member.profile.role === "admin";
  const email = requestedEmail(request.data, member.email, isAdmin);
  // requestedEmail only lets admins pick someone else, so this is an admin tagging a player out
  const adminEmail = email !== member.email ? member.email : null;
  const db = getFirestore();

  // players can only tag themselves out while the game is running.
  // admins can still tag people out any time (e.g. to fix a mistake after it ends)
  if (!isAdmin) {
    const phase = gamePhase(await getSettings());
    if (phase === "before") throw new HttpsError("failed-precondition", "Gotcha hasn't started yet");
    if (phase === "over") throw new HttpsError("failed-precondition", "Gotcha is over");
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const chain = new Chain(db, tx);
      const user = await chain.load(email);
      if (user.role !== "player") {
        throw new HttpsError("failed-precondition", "Only a living player can be tagged out");
      }

      // throws if they're already out (e.g. a double click), so nobody gets a tag twice,
      // or if the chain around them has changed. their chaser now chases their target
      const { chaserEmail, winner } = await chain.remove(email);
      const revived = await reviveVictims(db, tx, chain, email);

      const chaser = await chain.load(chaserEmail);
      chaser.tags += 1;
      chain.touch(chaserEmail);

      recordTagOut(db, tx, email, user, {
        name: `${chaser.firstName} ${chaser.lastName}`,
        class: chaser.class, dorm: chaser.dayorboard, tags: chaser.tags,
      });
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

      // A revived player can be tagged out again, replacing their old entry.
      tx.delete(db.doc(lastWordsIndexPath));
      // Last words are display data; the tag-out event drives leaderboard updates.
      tx.set(db.doc(`lastWords/${email}`), {
        lw: "",
        author: `${user.firstName} ${user.lastName}`,
        timestamp: Date.now(),
      });

      return { winner: revived > 0 ? null : winner, rows };
    });

    // winner is set when this tag left only one player standing.
    // rows are the admin table rows of everyone the tag changed. they include the chaser's
    // email, which players must not learn, so only admins get them
    return { status: 200, winner: result.winner, rows: isAdmin ? result.rows : {} };
  } catch (err) {
    // keep useful errors (like "already out") instead of hiding them behind a generic one
    if (err instanceof HttpsError) throw err;
    console.error("Tag out transaction failed:", err);
    throw new HttpsError("unknown", "Tag out failed");
  }
});
