import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Leaderboard, Profile, TagOutEvent } from "../../types";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

// A separate event is created for every tag, even when the victim was revived before.
export const updateLeaderboard = onDocumentCreated(
  { document: "tagOutEvents/{eventId}", retry: true },
  async (event) => {
    if (!event.data?.data().score) return;
    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`tagOutEvents/${event.params.eventId}`);
      const tag = (await tx.get(ref)).data() as TagOutEvent;
      if (tag.leaderboardUpdated || !tag.score) return;

      const boardRef = db.doc("leaderboard/main");
      const board = (await tx.get(boardRef)).data() as Leaderboard | undefined;
      const player = (await tx.get(db.doc(`data/${tag.tagger}`))).data() as Profile | undefined;
      const score = tag.score;
      const topTaggers = [...(board?.topTaggers ?? [])];
      const existing = topTaggers.find((entry) => entry.email === tag.tagger);
      // Current profile values preserve renames and score corrections during delayed delivery.
      const entry = {
        email: tag.tagger,
        name: player ? `${player.firstName} ${player.lastName}` : score.name,
        tags: player?.tags ?? score.tags,
      };
      if (existing) Object.assign(existing, entry);
      else topTaggers.push(entry);
      topTaggers.sort((a, b) => b.tags - a.tags || a.email.localeCompare(b.email));

      const byDorms = (board?.byDorms ?? []).map((entry) => ({ ...entry }));
      const dorm = byDorms.find((entry) => entry.dorm === score.dorm);
      if (dorm) dorm.tags++;
      else byDorms.push({ dorm: score.dorm, tags: 1 });

      const byClass = (board?.byClass ?? []).map((entry) => ({ ...entry }));
      const schoolClass = byClass.find((entry) => entry.class === score.class);
      if (schoolClass) schoolClass.tags++;
      else byClass.push({ class: score.class, tags: 1 });

      tx.set(boardRef, {
        topTaggers: topTaggers.slice(0, 10),
        byDorms, byClass, lastUpdated: FieldValue.serverTimestamp(),
      });
      // The marker and aggregates commit together, so trigger retries count once.
      tx.update(ref, { leaderboardUpdated: true });
    });
  },
);
