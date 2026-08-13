import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";

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
