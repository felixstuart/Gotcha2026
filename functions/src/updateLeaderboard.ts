import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Profile, Leaderboard } from "../../types";
import {
  onDocumentCreatedWithAuthContext,
} from "firebase-functions/firestore";

export const updateLeaderboard = onDocumentCreatedWithAuthContext(
  "lastWords/{userEmail}",
  async (event) => {
    const db = getFirestore();

    try {
      await db.runTransaction(async (tx) => {
        const tageeEmail = event.params.userEmail;
        const tageeDoc = db.doc(`data/${tageeEmail}`);

        // pull the leaderboard
        const leaderboardDoc = db.doc("leaderboard/main");

        const tageeSnap = await tx.get(tageeDoc);
        const tageeProfile = tageeSnap.data() as Profile;

        const chaserDoc = db.doc(`data/${tageeProfile.chaser}`);
        const chaserSnap = await tx.get(chaserDoc);
        const chaserProfile = chaserSnap.data() as Profile;

        const leaderboardSnap = await tx.get(leaderboardDoc);
        const leaderboard = leaderboardSnap.data() as Leaderboard;

        const updates: any = {};

        // now, check if the chaser is in the topTaggers or if they qualify to be
        // if they are, just increment the topTagger[chaser] count
        if (
          leaderboard.topTaggers.some(
            (tagger) =>
              tagger.name ===
              `${chaserProfile.firstName} ${chaserProfile.lastName}`
          )
        ) {
          updates.topTaggers = leaderboard.topTaggers.map((tagger) => {
            if (
              tagger.name ===
              `${chaserProfile.firstName} ${chaserProfile.lastName}`
            ) {
              return {
                name: tagger.name,
                tags: tagger.tags + 1,
              };
            } else {
              return tagger;
            }
          });
        } else {
          // otherwise, see if they qualify to be in the topTaggers
          const minTags = Math.min(
            ...leaderboard.topTaggers.map((tagger) => tagger.tags)
          );
          if (chaserProfile.tags > minTags) {
            // they qualify. add them to the topTaggers and trim the list
            const newTopTaggers = leaderboard.topTaggers
              .concat([
                {
                  name: `${chaserProfile.firstName} ${chaserProfile.lastName}`,
                  tags: chaserProfile.tags,
                },
              ])
              .sort((a, b) => b.tags - a.tags)
              .slice(0, leaderboard.topTaggers.length);

            updates.topTaggers = newTopTaggers;
          }
        }
        // now, update dorm and class leaderboards
        updates.byDorms = leaderboard.byDorms.map((dormEntry) => {
          if (dormEntry.dorm === chaserProfile.dayorboard) {
            return {
              dorm: dormEntry.dorm,
              tags: dormEntry.tags + 1,
            };
          } else {
            return dormEntry;
          }
        });

        updates.byClass = leaderboard.byClass.map((classEntry) => {
          if (classEntry.class === chaserProfile.class) {
            return {
              class: classEntry.class,
              tags: classEntry.tags + 1,
            };
          }
          return classEntry;
        });

        updates.lastUpdated = FieldValue.serverTimestamp();

        tx.update(leaderboardDoc, updates);
      });
      return;
    } catch (error) {
      return error;
    }
  }
);
