import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";

function targetSnapshot(email: string, profile: Profile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email,
    location: profile.location,
  };
}

/**
 * Whenever a player (the "tagger") has their `alive` flip from true to
 * false, revive everyone they eliminated and rebuild the chase chain in
 * the order those eliminations happened:
 *
 *   Q -> P1 -> P2 -> ... -> Pn -> F
 *
 * where Q is whoever was hunting the tagger, P1..Pn are the tagger's
 * victims in elimination order (earliest first), and F is the tagger's
 * current (still-living) target. Each Pi takes over the position the
 * next link in the chain held, rather than all victims collapsing onto
 * one spot.
 */
export const revenge = onDocumentUpdated("data/{email}", async (event) => {
  const before = event.data?.before.data() as Profile | undefined;
  const after = event.data?.after.data() as Profile | undefined;
  const taggerEmail = event.params.email;

  if (!before || !after) return;
  if (before.alive !== true || after.alive !== false) return;

  const chaserOfTagger = after.chaser;
  if (!chaserOfTagger || chaserOfTagger === "none") return;

  const db = getFirestore();

  // A victim's `chaser` field stays pointed at whoever eliminated them
  // until they're revived, so this finds everyone the tagger ever tagged
  // out (excluding their current living target, who also has
  // chaser == taggerEmail but alive == true).
  const eliminatedSnapshot = await db
    .collection("data")
    .where("chaser", "==", taggerEmail)
    .where("alive", "==", false)
    .get();

  if (eliminatedSnapshot.empty) return;

  // Order victims by when they were tagged out, using their lastWords
  // timestamp (set at the moment of elimination).
  const eliminated = await Promise.all(
    eliminatedSnapshot.docs.map(async (doc) => {
      const lastWordsDoc = await db.doc(`lastWords/${doc.id}`).get();
      const timestamp = (lastWordsDoc.data()?.timestamp as number) ?? 0;
      return { email: doc.id, profile: doc.data() as Profile, timestamp };
    })
  );
  eliminated.sort((a, b) => a.timestamp - b.timestamp);

  const batch = db.batch();

  // Q now hunts P1 instead of the tagger's (former) target.
  batch.update(db.doc(`data/${chaserOfTagger}`), {
    target: targetSnapshot(eliminated[0].email, eliminated[0].profile),
  });

  eliminated.forEach((victim, i) => {
    const chaser = i === 0 ? chaserOfTagger : eliminated[i - 1].email;
    const next = eliminated[i + 1];
    const target = next
      ? targetSnapshot(next.email, next.profile)
      : {
          firstName: after.target.firstName,
          lastName: after.target.lastName,
          email: after.target.email,
          location: after.target.location,
        };

    batch.update(db.doc(`data/${victim.email}`), {
      alive: true,
      chaser,
      target,
    });
  });

  // The tagger's final (still-living) target is now hunted by Pn.
  batch.update(db.doc(`data/${after.target.email}`), {
    chaser: eliminated[eliminated.length - 1].email,
  });

  await batch.commit();
});
