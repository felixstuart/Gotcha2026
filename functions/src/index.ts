/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { Profile } from "../../types";

initializeApp();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

// export const getTarget = onRequest(async (request, response) => {});

// export const getLeaderboard = onRequest(async (request, response) => {
//   // fetch the leaderboard data from the snapshot
// });

export const getProfile = onCall(async (request) => {
  // request.data contains the data passed from the client
  // request.auth contains the authenticated user info

  if (!request.auth) {
    throw new Error("User must be authenticated");
  }
  if (!request.auth.token.email) {
    throw new HttpsError("unknown", "Something went wrong");
  }

  // go to the db and fetch the profile for request.auth.emails
  const db = getFirestore();

  console.log("Fetching profile for:", request.auth.token.email);
  try {
    const profileDoc = await db
      .collection("data")
      .doc(request.auth.token.email)
      .get();

    const profileData = profileDoc.data() as Profile | undefined;

    if (!profileData) {
      throw new Error("Profile not found");
    }
    return {
      name: `${profileData.firstName} ${profileData.lastName}`,
      target: profileData.target,
      alive: profileData.alive,
      tags: profileData.tags,
      location: profileData.location || "Unknown",
    };
  } catch (e) {
    // milton emails: firstname_lastname@milton.edu
    if (request.auth.token.email.endsWith("@milton.edu")) {
      const email = request.auth.token.email;
      const namePart = email.split("@")[0];
      const [firstName, lastName] = namePart.split("_");

      const newProfile: Profile = {
        alive: false,
        chaser: "none",
        class: "observer",
        dayorboard: "observer",
        firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
        lastName: lastName.charAt(0).toUpperCase() + lastName.slice(1),
        tags: 0,
        target: "none",
      };
      await db.collection("data").doc(request.auth.token.email).set(newProfile);

      console.log("Created observer profile for:", request.auth.token.email);
      return {
        name: `${newProfile.firstName} ${newProfile.lastName}`,
        target: newProfile.target,
        alive: newProfile.alive,
        tags: newProfile.tags,
        location: "Observer",
      };
    }
    throw new HttpsError(
      "unknown",
      `Couldn't fetch profile for ${request.auth.token.email}. ` +
        "Please make sure you are logged in with a valid Milton email. " +
        "If you believe this is an error, please email Programming Club."
    );
  }
});

// tag out function
export const tagOut = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  if (!request.auth.token.email) {
    throw new HttpsError("unknown", "Something went wrong");
  }

  const userEmail = request.auth.token.email;
  console.log("Tag out requested for:", userEmail);

  const db = getFirestore();

  try {
    return await db.runTransaction(async (transaction) => {
      const userDocRef = db.collection("data").doc(userEmail);
      const userDoc = await transaction.get(userDocRef);
      const userData = userDoc.data() as Profile | undefined;

      if (!userData) {
        throw new HttpsError("not-found", "Profile not found");
      }

      if (!userData.alive) {
        throw new HttpsError(
          "failed-precondition",
          "You are already tagged out."
        );
      }

      const targetEmail = userData.target;
      const chaserEmail = userData.chaser;

      if (targetEmail === "none" || chaserEmail === "none") {
        throw new HttpsError(
          "failed-precondition",
          "Invalid game state: no target or chaser assigned"
        );
      }

      const targetDocRef = db.collection("data").doc(targetEmail);
      const chaserDocRef = db.collection("data").doc(chaserEmail);

      const targetDoc = await transaction.get(targetDocRef);
      const targetData = targetDoc.data() as Profile | undefined;

      if (!targetData) {
        throw new HttpsError("not-found", "Target profile not found");
      }

      const chaserDoc = await transaction.get(chaserDocRef);
      const chaserData = chaserDoc.data() as Profile | undefined;

      if (!chaserData) {
        throw new HttpsError("not-found", "Chaser profile not found");
      }

      // Update the tagged-out user
      transaction.update(userDocRef, {
        alive: false,
        target: "none",
        chaser: "none",
      });

      // Give the chaser their new target (the victim's former target)
      transaction.update(chaserDocRef, {
        target: targetEmail,
        tags: chaserData.tags + 1,
      });

      // Update the former target to have the chaser as their new chaser
      transaction.update(targetDocRef, {
        chaser: chaserEmail,
      });

      // Create a last words entry using the user's email as the document ID
      const lastWordsRef = db.collection("lastWords").doc(userEmail);
      transaction.set(lastWordsRef, {
        author: `${userData.firstName} ${userData.lastName}`,
        lw: "", // Empty initially — player can update later
        timestamp: new Date().toISOString(),
        taggedBy: chaserEmail, // Optional: nice for context/display
      });

      return { success: true, message: "Tagged out successfully" };
    });
  } catch (error) {
    console.error("Error in tagOut:", error);
    // If it's already an HttpsError, re-throw it; otherwise wrap it
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      "An unexpected error occurred during tag out"
    );
  }
});
