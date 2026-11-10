import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { AdminIndexRow, Profile } from "../../types";
import { db } from "./firebase";
import { ADMIN_INDEX_PATH, toAdminIndexRow } from "./adminIndex";
import { Chain } from "./chain";
import { lastWordsIndexPath } from "./getLastWords";
import { getSettings } from "./settings";

/**
 * Brings everyone `taggerEmail` tagged out back into the loop, in the order they went out:
 *
 *   Q -> P1 -> P2 -> ... -> Pn -> F
 *
 * where Q is whoever got the tagger, P1..Pn are the tagger's victims (earliest first), and F is
 * who Q is chasing now (the tagger's old target, unless the loop has moved on since).
 *
 * This runs a moment after the tag out, and by then Q or F may have been tagged out too. So it
 * works from the profiles as they are now, in one transaction, through Chain like every other
 * loop change, instead of from the copy of the tagger the trigger was sent. If Q is out, the
 * victims go after the closest player up the line who is still in (see Chain.closestAliveChaser).
 *
 * Their old last words are deleted, like an admin revive does: the leaderboard only counts a
 * tag when a last words entry is created, so a leftover one would hide their next tag out.
 * @returns the emails of the players it brought back, earliest tagged first
 */
export async function reviveVictims(taggerEmail: string): Promise<string[]> {
  return db.runTransaction(async (tx) => {
    const chain = new Chain(db, tx);

    // the trigger can run twice or late, so check they're still out
    const taggerSnap = await tx.get(db.doc(`data/${taggerEmail}`));
    const tagger = taggerSnap.data() as Profile | undefined;
    if (!tagger || tagger.alive) return [];

    // null when nobody got them (the check-in sweep sets their chaser to "none"), or nobody is left
    const anchor = await chain.closestAliveChaser(taggerEmail);
    if (!anchor) return [];

    // A victim's `chaser` stays pointed at whoever got them until they're revived, so this
    // finds everyone the tagger ever tagged out (their living target has alive == true)
    const victimSnaps = await tx.get(db
      .collection("data")
      .where("chaser", "==", taggerEmail)
      .where("alive", "==", false));
    const victimEmails = victimSnaps.docs.map((doc) => doc.id).filter((email) => email !== taggerEmail);
    if (victimEmails.length === 0) return [];

    // ordered by when they were tagged out: the time on their last words, set at that moment
    const lastWordsRefs = victimEmails.map((email) => db.doc(`lastWords/${email}`));
    const lastWordsSnaps = await tx.getAll(...lastWordsRefs);
    const victims = victimEmails
      .map((email, i) => ({ email, timestamp: (lastWordsSnaps[i].data()?.timestamp as number) ?? 0 }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // each one goes in right after the anchor, so the last one tagged goes in first
    // and the earliest ends up closest to the anchor
    for (const victim of [...victims].reverse()) {
      await chain.insertAfter(victim.email, anchor);
    }

    // writes from here on
    chain.save();

    const rows: Record<string, AdminIndexRow> = {};
    for (const [changedEmail, profile] of chain.changed()) {
      rows[changedEmail] = toAdminIndexRow(profile);
    }
    tx.set(db.doc(ADMIN_INDEX_PATH), { players: rows, updatedAt: Date.now() }, { merge: true });

    for (const ref of lastWordsRefs) tx.delete(ref);
    tx.delete(db.doc(lastWordsIndexPath));

    return victims.map((victim) => victim.email);
  });
}

/**
 * Whenever a player's `alive` flips from true to false, everyone they tagged out
 * comes back (see reviveVictims).
 */
export const revenge = onDocumentUpdated("data/{email}", async (event) => {
  const before = event.data?.before.data() as Profile | undefined;
  const after = event.data?.after.data() as Profile | undefined;

  if (!before || !after) return;
  if (before.alive !== true || after.alive !== false) return;

  // admins can switch revenge off in the game settings
  if (!(await getSettings()).revengeEnabled) return;

  // nobody got them (e.g. they missed check-in), so there's no revenge
  if (!after.chaser || after.chaser === "none") return;

  const revived = await reviveVictims(event.params.email);
  if (revived.length > 0) {
    console.log(`revenge for ${event.params.email}: brought back ${revived.length} player(s)`);
  }
});
