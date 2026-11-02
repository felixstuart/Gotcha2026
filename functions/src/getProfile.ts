import { requireRegisteredSchoolUser, requestedEmail } from "./authorization";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { Profile } from "../../types";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, featureCollection } from "@turf/helpers";
import { db } from "./firebase";
import type { Position } from "geojson"; // Uses (longitude, latitude) be careful

export type Location = [latitude: number, longitude: number];
type RawBuilding = {
    name: string;
    coords: Position[];
};

// geofence here. i'm leaving my coordinates out in development, but i added some code to seed.ts to automatically inject a .geojson file
// // if you want to test it out, you'll need to generate your own .geojson file---i suggest geojson.io. we'll provide a milton one once gotcha gets closer
/**
 * Updates target.location for the chaser
 * so we can say where the chaser tagged their target out 
 * (improves efficiency since Gotcha is read, not write heavy)
 * @param profile
 * @param targetLocation 
 */
export const updateChaserTargetLocation = async (targetProfile: Profile, targetLocation: Location): Promise<void> => {
    const rawBuildings: RawBuilding[] = [
        {
            name: "Stuart Empire",
            coords: [
                [42.25820, -71.06620],
                [42.25820, -71.06590],
                [42.25798, -71.06590],
                [42.25798, -71.06620],
                [42.25820, -71.06620],
            ],
        },
        {
            name: "FMC",
            coords: [
                [42.25848, -71.06615],
                [42.25848, -71.06585],
                [42.25825, -71.06585],
                [42.25825, -71.06615],
                [42.25848, -71.06615],
            ],
        },
        {
            name: "Quad",
            coords: [
                [42.25815, -71.06580],
                [42.25815, -71.06540],
                [42.25785, -71.06540],
                [42.25785, -71.06580],
                [42.25815, -71.06580],
            ],
        },
    ]; // Syntheitcally generated coords -- not yet accurate (Todo)

    const buildings = featureCollection(
        rawBuildings
        .filter((rawBuilding) => rawBuilding.coords.length >= 4)
        .map((rawBuilding) => polygon([
            rawBuilding.coords.map(([latitude, longitude]) => [longitude, latitude]),
        ], { name: rawBuilding.name })),
    );

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
}

/**
 * Get a profile based on an email. 
 * Assumes you've already validated permissions. 
 * Outputs null if no profile found.
 * @param userLocation 
 * @param email 
 * @returns 
 */
export const getUserProfileByEmail = async (userEmail: string): Promise<Profile | null> => {
    const profileDocument = await db.collection("data").doc(userEmail).get(); // emails used as document id
    const profile = profileDocument.data() as Profile | undefined;
    if (!profile) return null;
    return profile;
}


/**
 * Firebase callable that returns the user's profile or
 * returns null when they don't have a profile
 */ 
export const getProfile = onCall(async (request): Promise<Profile | null> => {
  const member = await requireRegisteredSchoolUser(request);
  const email = requestedEmail(request.data, member.email, member.profile.role);

    const profile = await getUserProfileByEmail(email) ;

    const location = request.data?.location;
    if (location !== undefined && location !== null) {
        if (!Array.isArray(location) || location.length !== 2 ||
            !location.every((v: unknown) => typeof v === "number" && Number.isFinite(v)) ||
            Math.abs(location[0]) > 90 || Math.abs(location[1]) > 180) {
            throw new HttpsError("invalid-argument", "Invalid coordinates");
        }
        if (email !== member.email) {
            throw new HttpsError("permission-denied", "Only players make updates");
        }
        if (profile && profile.alive && profile.role === "player") {
            await updateChaserTargetLocation(profile, location as Location);
        }
    }
 
    return profile;
});
