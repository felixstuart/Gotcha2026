import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Profile, Role } from "../../types";
import { requireAdmin, syncRoleClaim } from "./auth";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, featureCollection } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * Gets the user's profile and
 * creates a **player** (not admin) profile if the user hasn't joined the game yet
 */
export const getProfile = onCall(async (request) => {
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
    requireAdmin(request);
    isAdmin = true;
    email = request.data.email;
  }

  // Check if the user already has a profile
  const profileDoc = await db.collection("data").doc(email).get(); // emails used as document id
  const profile = profileDoc.data() as Profile | undefined;

  if (profile != undefined) {
    const location = request.data.location;
    if (!profile) throw new Error("Profile not found");
    const hasLocation =
      Array.isArray(location) &&
      typeof location[0] === "number" &&
      typeof location[1] === "number";
    // geofencing is best-effort: a failure here should never stop the profile from loading
    if (hasLocation) {
    try {
      // building polygons live in config/buildings, written by seed.ts from buildings.geojson
      // (firestore can't store nested arrays, so the FeatureCollection is saved as a JSON string)
      const buildingsDoc = await db.collection("config").doc("buildings").get();
      const geojson = buildingsDoc.data()?.geojson;
      const parsed: FeatureCollection = geojson ?
        JSON.parse(geojson) :
        featureCollection([]);

      // footprints nobody has named yet aren't geofenced
      const buildings = parsed.features.filter(
        (f): f is Feature<Polygon | MultiPolygon> =>
          !!f.properties?.name &&
          (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"),
      );

    const building = buildings.find((building) => (
      booleanPointInPolygon(
        point([location[1], location[0]]), 
        building, 
      )
    ));

    if (building) {
      const buildingName = building.properties?.name || "Unknown Location"

      profile.location = buildingName;

      if (profile.chaser && profile.chaser != "none") {
        await db.collection("data").doc(profile.chaser).update({
          "target.location" : buildingName
        })
      }
    } else {
      console.log("no building found")
    }

    } catch (err) {
      console.error("geofencing failed:", err);
    }
    }

    console.log(profile);

    const claimsChanged = isAdmin ? false : await trySyncRoleClaim(request, profile.role);
    return { profile, claimsChanged };
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

    const claimsChanged = await trySyncRoleClaim(request, newProfile.role);
    return { profile: newProfile, claimsChanged };
  }
});

// like the geofencing, a failed claim sync should never stop the profile from loading
async function trySyncRoleClaim(request: CallableRequest, role: Role): Promise<boolean> {
  try {
    return await syncRoleClaim(request, role);
  } catch (err) {
    console.error("role claim sync failed:", err);
    return false;
  }
}
