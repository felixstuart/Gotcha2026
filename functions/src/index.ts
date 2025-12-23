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
  console.log("tagOut called for", request.auth?.token.email);
  // start off by verifying the user is authenticated
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  const db = getFirestore();

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(
        db.doc("data/" + request.auth?.token.email)
      );
      const userData = userDoc.data() as Profile | undefined;

      const chaserDoc = await transaction.get(
        db.doc("data/" + userData?.chaser)
      );
      const chaserData = chaserDoc.data() as Profile | undefined;
      const targetDoc = await transaction.get(
        db.doc("data/" + userData?.target)
      );
      const targetData = targetDoc.data() as Profile | undefined;

      if (!userData || !chaserData || !targetData) {
        throw new HttpsError("not-found", "One of the profiles was not found");
      }

      // increment the tagger's tag count
      transaction.update(chaserDoc.ref, {
        tags: chaserData.tags + 1,
      });
      // set the tagee to not alive
      transaction.update(userDoc.ref, {
        alive: false,
      });
      // set the tagee's target to the chaser's target
      transaction.update(chaserDoc.ref, {
        target: userData.target,
      });
      // ... and set the target to have the chaser as their new chaser
      transaction.update(targetDoc.ref, {
        chaser: userData.chaser,
      });

      // finally, create an empty lastWords field for the tagee
      transaction.set(db.doc("lastWords/" + request.auth?.token.email), {
        lw: "",
        author: userData.firstName + " " + userData.lastName,
        timestamp: Date.now(),
      });
    });
  } catch (e) {
    throw new HttpsError("unknown", "Tag out could not be completed");
  }
});
