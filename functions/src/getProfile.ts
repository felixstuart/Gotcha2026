import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile } from "../../types";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, featureCollection } from "@turf/helpers";

const db = getFirestore();

type Location = [latitude: number, longitude: number];

const rawBuildings = [
  {
      name: "Stuart Empire",
      coords: [[],],
  },
]; 

const buildings = featureCollection(
    rawBuildings
      .filter((rawBuilding) => rawBuilding.coords.every((ring) => ring.length >= 4))
      .map((rawBuilding) => polygon(rawBuilding.coords, { name: rawBuilding.name })),
);


/**
 * Updates target.location for the chaser
 * @param profile
 * @param targetLocation 
 * @param targetEmail 
 */
export const updateChaserTargetLocation = async (targetProfile: Profile, targetLocation: Location, targetEmail: string): Promise<void> => {
    const building = buildings.features.find((building) => (
        booleanPointInPolygon(
            point([targetLocation[1], targetLocation[0]]), 
            building,
        )
    ));

    if (building) {
        const buildingName = building.properties?.name || "Unknown Location"
        targetProfile.location = buildingName;

        await db.collection("data").doc(targetProfile.chaser).update({
          "target.location" : buildingName
        })
    } else {
        console.log("no building found"); // todo, maybe fix this silent failure
    }

    console.log(targetProfile)
}


/**
 * Get a profile based on an email. Assumes you've already validated permissions
 * @param location 
 * @param email 
 * @returns 
 */
export const getUserProfileByEmail = async (userLocation: Location, userEmail: string): Promise<Profile> => {
    const profileDocument = await db.collection("data").doc(userEmail).get(); // emails used as document id
    const profile = profileDocument.data() as Profile | undefined;
    if (!profile) throw new Error("Profile not found");

    if (location != null) {
      // geofence here. i'm leaving my coordinates out in development, but i added some code to seed.ts to automatically inject a .geojson file
      // if you want to test it out, you'll need to generate your own .geojson file---i suggest geojson.io. we'll provide a milton one once gotcha gets closer

        updateChaserTargetLocation(profile, userLocation, userEmail);
    }

    return profile;
}

/**
 * Creates a profile based on user email
 * @param email 
 * @param isAdmin 
 * @returns 
 */
export const createProfile = async (email: string): Promise<Profile | null> => {
    if (!email.endsWith("@milton.edu")) {
        throw new HttpsError("permission-denied", "Invalid email");
    }

    // Milton Academy student email format is [first name]_[last_name][last two digits of graduation year]@milton.edu
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

/**
 * Firebase callable that gets the user's profile and
 * creates a **player** (not admin) profile if the user hasn't joined the game yet
 */
 
export const getProfile = onCall(async (request): Promise<Profile | null> => {
  if (!request.auth || !request.auth.token.email) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  let email;
  let isAdmin = false;

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
      if (location != null) {
          // geofence here. i'm leaving my coordinates out in development, but i added some code to seed.ts to automatically inject a .geojson file
          // if you want to test it out, you'll need to generate your own .geojson file---i suggest geojson.io. we'll provide a milton one once gotcha gets closer

          await updateChaserTargetLocation(profile, location, email);
    }

    return profile;
  } else { 
    // CREATING A NEW PLAYER ------------- 
    // todo, this shouldn't be the case after the game starts or else we're gonna get problems
    if (!isAdmin) { return null }
    return await createProfile(email);
  }
});
