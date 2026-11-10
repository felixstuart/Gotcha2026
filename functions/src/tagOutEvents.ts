import { Firestore, Transaction } from "firebase-admin/firestore";
import { Profile, TagOutEvent } from "../../types";

/** Call after all transaction reads, before chain.save persists the profile. */
export function recordTagOut(
  db: Firestore, tx: Transaction, email: string, player: Profile,
  score?: TagOutEvent["score"],
) {
  const ref = db.collection("tagOutEvents").doc();
  player.activeTagOutEvent = ref.id;
  const event: TagOutEvent = {
    tagger: player.chaser, victim: email, timestamp: Date.now(), active: true,
    ...(score && { score }),
  };
  tx.create(ref, event);
}
