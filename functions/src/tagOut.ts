import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";

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