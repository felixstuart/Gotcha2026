import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";

/**
 * Gets the user's profile and
 * creates a **player** (not admin) profile if the user hasn't joined the game yet
 */
export const getProfile = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const email = request.auth.token.email;
  const db = getFirestore();

  try {
    // Check if the user already has a profile

    const profileDoc = await db.collection("data").doc(email).get(); // emails used as document id
    const profile = profileDoc.data() as Profile | undefined;

    if (!profile) throw new Error("Profile not found");

    return profile;
  } catch {
    if (!email.endsWith("@milton.edu")) {
      throw new HttpsError("permission-denied", "Invalid email");
    }

    // Create a new profile if the user doesn't have one
    // Milton Academy student email format is [first name]_[last_name][last two digits of graduation year]@milton.edu
    const [firstName, lastName] = email
      .split("@")[0]
      .slice(0, -2)
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));

    const newProfile: Profile = {
      alive: false,
      role: "player",
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

    return newProfile;
  }
});

