import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Profile, LastWordsEntry, Leaderboard } from "../../types";
import {
  onDocumentCreatedWithAuthContext,
} from "firebase-functions/firestore";

initializeApp();
setGlobalOptions({ maxInstances: 10 });

export const getProfile = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const email = request.auth.token.email;
  const db = getFirestore();

  try {
    const profileDoc = await db.collection("data").doc(email).get();
    const profile = profileDoc.data() as Profile | undefined;

    if (!profile) throw new Error("Profile not found");

    return {
      name: `${profile.firstName} ${profile.lastName}`,
      target: {
        name: `${profile.target.firstName} ${profile.target.lastName}`,
        email: profile.target.email,
        location: profile.target.location,
      },
      alive: profile.alive,
      tags: profile.tags,
      location: profile.location || "Unknown",
    };
  } catch {
    if (!email.endsWith("@milton.edu")) {
      throw new HttpsError("permission-denied", "Invalid email");
    }

    // Milton Academy student email format is [first name]_[last_name][last two digits of graduation year]@milton.edu
    const [firstName, lastName] = email
      .split("@")[0]
      .slice(0, -2)
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));

    const newProfile: Profile = {
      alive: false,
      chaser: "none",
      class: "observer",
      dayorboard: "observer",
      firstName,
      lastName,
      tags: 0,
      target: {
        firstName: "None",
        lastName: "",
        email: "",
      },
    };

    await db.collection("data").doc(email).set(newProfile);

    return {
      name: `${firstName} ${lastName}`,
      target: {
        name: "None",
        email: "",
      },
      alive: false,
      tags: 0,
      location: "Observer",
    };
  }
});

export const tagOut = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const db = getFirestore();
  const userEmail = request.auth.token.email;

  try {
    await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(db.doc(`data/${userEmail}`));
      const user = userDoc.data() as Profile;

      const chaserDoc = await tx.get(db.doc(`data/${user.chaser}`));
      const chaser = chaserDoc.data() as Profile;

      const targetEmail = user.target.email;
      const targetDoc = await tx.get(db.doc(`data/${targetEmail}`));
      const target = targetDoc.data() as Profile;

      if (!user || !chaser || !target) {
        throw new HttpsError("not-found", "Profile missing");
      }

      const newTargetSnapshot = {
        firstName: target.firstName,
        lastName: target.lastName,
        email: targetEmail,
        location: target.location,
      };

      tx.update(chaserDoc.ref, {
        tags: chaser.tags + 1,
        target: newTargetSnapshot,
      });

      tx.update(userDoc.ref, {
        alive: false,
      });

      tx.update(targetDoc.ref, {
        chaser: user.chaser,
      });

      tx.set(db.doc(`lastWords/${userEmail}`), {
        lw: "",
        author: `${user.firstName} ${user.lastName}`,
        timestamp: Date.now(),
      });
    });

    return { status: 200 };
  } catch {
    throw new HttpsError("unknown", "Tag out failed");
  }
});

export const setLastWords = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const lastWords = request.data.lastWords;
  if (typeof lastWords !== "string") {
    throw new HttpsError("invalid-argument", "lastWords must be a string");
  }

  const db = getFirestore();
  const ref = db.doc(`lastWords/${request.auth.token.email}`);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Last words doc not found");
  }

  if ((snap.data() as any).lw) {
    throw new HttpsError("already-exists", "Last words already set");
  }

  await ref.update({ lw: lastWords });
  return { status: 200 };
});

export const getLastWords = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const db = getFirestore();
  const snaps = await db
    .collection("lastWords")
    .where("lw", "!=", "")
    .orderBy("lw")
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  const lastWords = snaps.docs.map((doc) => doc.data()) as LastWordsEntry[];
  return { lastWords };
});

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

export const getLeaderboard = onCall(async (request) => {
  if (!request.auth) {
    return null;
  }

  const db = getFirestore();

  const leaderboardDoc = db.doc("leaderboard/main");
  const leaderboardSnap = await leaderboardDoc.get();

  const leaderboard = leaderboardSnap.data() as unknown as Leaderboard;
  return { leaderboard };
});
