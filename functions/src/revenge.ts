import { Firestore, Transaction } from "firebase-admin/firestore";
import { Chain } from "./chain";
import { getSettings } from "./settings";
import { TagOutEvent } from "../../types";

/**
 * When revenge is enabled in the admin panel, revive a tagged-out player's
 * victims in elimination order, in the same transaction as their tag-out:
 *
 *   Q -> P1 -> P2 -> ... -> Pn -> F
 *
 * Q is the tagger's chaser, P1..Pn are their still-eliminated victims
 * (earliest first), and F is their target. Active tag-out events are returned
 * in time order by an index; there is no local sort, chain traversal or time cutoff.
 *
 * Call after chain.remove and before chain.save. Returns how many came back.
 */
export async function reviveVictims(db: Firestore, tx: Transaction, chain: Chain, email: string): Promise<number> {
  if (!(await getSettings()).revengeEnabled) return 0;

  const events = await tx.get(db.collection("tagOutEvents")
    .where("tagger", "==", email)
    .where("active", "==", true)
    .orderBy("timestamp"));

  let anchor = (await chain.load(email)).chaser;
  let revived = 0;
  for (const doc of events.docs) {
    const event = doc.data() as TagOutEvent;
    const victim = await chain.load(event.victim);
    chain.closeTagOutEvent(doc.id);
    // Old history must never revive an alive player or a different elimination.
    if (victim.alive || victim.activeTagOutEvent !== doc.id) continue;
    await chain.insertAfter(event.victim, anchor);
    anchor = event.victim;
    revived++;
  }
  return revived;
}
