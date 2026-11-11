import { Firestore, Transaction } from "firebase-admin/firestore";
import { TagOutEvent } from "../../types";
import { Chain } from "./chain";
import { getSettings } from "./settings";

/**
 * Revive current victims, earliest elimination first, inside the caller's chain
 * transaction. Events are the source of truth, not mutable last-words display data.
 * Queue writes on Chain so every caller can finish reading before chain.save().
 * Existing games must run scripts/backfill-tag-out-events.mjs before this rollout.
 */
export async function reviveVictims(
  db: Firestore, tx: Transaction, chain: Chain, taggerEmail: string,
): Promise<number> {
  if (!(await getSettings()).revengeEnabled) return 0;
  const anchor = await chain.closestAliveChaser(taggerEmail);
  if (!anchor) return 0;

  const events = await tx.get(db.collection("tagOutEvents")
    .where("tagger", "==", taggerEmail)
    .where("active", "==", true)
    .orderBy("timestamp", "asc"));
  const victims: string[] = [];
  for (const doc of events.docs) {
    const event = doc.data() as TagOutEvent;
    const victim = await chain.load(event.victim);
    if (!victim.alive && victim.activeTagOutEvent === doc.id) victims.push(event.victim);
    // Stale events must not revive a player's different, later elimination.
    chain.closeTagOutEvent(doc.id);
  }
  for (const email of victims.reverse()) {
    await chain.insertAfter(email, anchor);
    chain.clearLastWords(email);
  }
  return victims.length;
}
