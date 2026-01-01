import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Profile, LastWordsEntry } from "../../types";

initializeApp();
setGlobalOptions({ maxInstances: 10 });

export const helloWorld = onRequest((req, res) => {
  logger.info("Hello logs!", { structuredData: true });
  res.send("Hello from Firebase!");
});

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

    const [firstName, lastName] = email
      .split("@")[0]
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
