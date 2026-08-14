import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, featureCollection } from "@turf/helpers";

/**
 * Gets the user's profile and
 * creates a **player** (not admin) profile if the user hasn't joined the game yet
 */
export async const getProfile = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  let email;
  let isAdmin = false;
  const db = getFirestore();

  if (!request.data.email) {
    email = request.auth.token.email;
  } else {
    // Make sure the requester is an admin
    // if they are requesting someone else's info
    isAdmin = true;
    const requesterProfileDoc = await db
      .collection("data")
      .doc(request.auth.token.email)
      .get(); // emails used as document id
    const requesterProfile = requesterProfileDoc.data() as Profile | undefined;
    const requesterRole = requesterProfile?.role;

    if (requesterRole != "admin") {
      throw new HttpsError(
        "permission-denied",
        "User must be admin the access other user's data",
      );
    }

    email = request.data.email;
  }

  // Check if the user already has a profile
  const profileDoc = await db.collection("data").doc(email).get(); // emails used as document id
  const profile = profileDoc.data() as Profile | undefined;

  if (profile != undefined) {
    const location = request.data.location;
    if (!profile) throw new Error("Profile not found");
    if (location != null) {
      // geofence here. i'm leaving my coordinates out in development, but i added some code to seed.ts to automatically inject a .geojson file
      // if you want to test it out, you'll need to generate your own .geojson file---i suggest geojson.io. we'll provide a milton one once gotcha gets closer

      const rawBuildings = [
        {
          name: "Stuart Empire",
          coords: [
            [

            ],
          ],
        },
      ];

    const buildings = featureCollection(
        rawBuildings.map((b) => polygon(b.coords, { name: b.name })),
    );

    const building = buildings.features.find((building) => (
      booleanPointInPolygon(
        point([location[1], location[0]]), 
        building, 
      )
    ));

    if (building) {
      const buildingName = building.properties?.name || "Unknown Location"

      profile.location = buildingName;

      await db.collection("data").doc(profile.chaser).update({
        "target.location" : buildingName
      })
    } else {
      console.log("no building found")
    }

    console.log(profile)

    return { profile };
  } else {
    if (!email.endsWith("@milton.edu")) {
      throw new HttpsError("permission-denied", "Invalid email");
    }

    // Create a new profile if the user doesn't have one
    // Milton Academy student email format is [first name]_[last_name][last two digits of graduation year]@milton.edu
    if (isAdmin) {
      return null;
    }

    const [firstName, lastName] = email
      .split("@")[0]
      .slice(0, -2)
      .split("_")
      .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1));

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
