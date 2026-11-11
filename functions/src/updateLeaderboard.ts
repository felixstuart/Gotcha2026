import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Leaderboard, Profile, TagOutEvent } from "../../types";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

/** Each elimination is credited once, even after revival or trigger redelivery. */
export const updateLeaderboard = onDocumentCreated(
  { document: "tagOutEvents/{eventId}", retry: true },
  async (event) => {
    if (!event.data) return;
    const db = getFirestore();
    const eventRef = db.doc(`tagOutEvents/${event.params.eventId}`);
    await db.runTransaction(async (tx) => {
      // Re-read the marker in the transaction: event.data is the creation snapshot.
      const scoreEvent = (await tx.get(eventRef)).data() as TagOutEvent | undefined;
      if (!scoreEvent?.score || scoreEvent.leaderboardUpdated) return;
      const score = scoreEvent.score;
      const profile = (await tx.get(db.doc(`data/${scoreEvent.tagger}`))).data() as Profile | undefined;
      const boardRef = db.doc("leaderboard/main");
      const board = (await tx.get(boardRef)).data() as Leaderboard | undefined;
      if (!board) throw new Error("leaderboard/main is missing; restore it before retrying scores");

      // Current profile totals preserve admin corrections and out-of-order events.
      const tagger = {
        email: scoreEvent.tagger,
        name: profile ? `${profile.firstName} ${profile.lastName}` : score.name,
        tags: profile?.tags ?? score.tags,
      };
      const topTaggers = board.topTaggers.filter((entry) => entry.email !== tagger.email)
        .concat(tagger)
        .sort((a, b) => b.tags - a.tags || a.email.localeCompare(b.email))
        .slice(0, 10);
      const byDorms = board.byDorms.map((entry) => ({ ...entry }));
      const dorm = byDorms.find((entry) => entry.dorm === score.dorm);
      if (dorm) dorm.tags += 1;
      else byDorms.push({ dorm: score.dorm, tags: 1 });
      const byClass = board.byClass.map((entry) => ({ ...entry }));
      const year = byClass.find((entry) => entry.class === score.class);
      if (year) year.tags += 1;
      else byClass.push({ class: score.class, tags: 1 });

      tx.update(boardRef, { topTaggers, byDorms, byClass, lastUpdated: FieldValue.serverTimestamp() });
      tx.update(eventRef, { leaderboardUpdated: true });
    });
  },
);
