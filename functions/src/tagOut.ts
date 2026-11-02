import { requireRegisteredSchoolUser, requestedEmail } from "./authorization";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";

export const tagOut = onCall(async (request) => {
  const member = await requireRegisteredSchoolUser(request);
  const email = requestedEmail(request.data, member.email, member.profile.role);
  const db = getFirestore();

  try {
    await db.runTransaction(async (tx) => {
      const userDoc = await tx.get(db.doc(`data/${email}`));
      const user = userDoc.data() as Profile | undefined;
      if (!user) throw new HttpsError("not-found", "Profile missing");
      if (!user.alive || user.role !== "player") {
        throw new HttpsError("failed-precondition", "Only a living player can be tagged out");
      }

      const chaserDoc = await tx.get(db.doc(`data/${user.chaser}`));
      const chaser = chaserDoc.data() as Profile;

      const targetEmail = user.target.email;
      const targetDoc = await tx.get(db.doc(`data/${targetEmail}`));
      const target = targetDoc.data() as Profile;

      if (!user || !chaser || !target) {
        throw new HttpsError("not-found", "Profile missing");
      }

      if (!chaser.alive || chaser.target.email !== email || target.chaser !== email) {
        throw new HttpsError("failed-precondition", "Chase chain has changed");
      }

      const newTargetSnapshot = {
        firstName: target.firstName,
        lastName: target.lastName,
        email: targetEmail,
        ...(target.location !== undefined && { location: target.location }),
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

      tx.set(db.doc(`lastWords/${email}`), {
        lw: "",
        author: `${user.firstName} ${user.lastName}`,
        timestamp: Date.now(),
      });
    });

    return { status: 200 };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Tag out transaction failed");
    throw new HttpsError("unknown", "Tag out failed");
  }
});
