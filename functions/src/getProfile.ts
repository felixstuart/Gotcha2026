import { HttpsError, onCall } from "firebase-functions/v2/https";
import { Profile } from "../../types";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, featureCollection } from "@turf/helpers";
import { db } from "./firebase";
import type { Position } from "geojson"; // TODO: uses longitude, latitude, be careful

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
        .filter((rawBuilding) => rawBuilding.coords.every((ring) => ring.length >= 4))
        .map((rawBuilding) => polygon([rawBuilding.coords], { name: rawBuilding.name })),
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

    console.log(targetProfile)
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
    if (!request.auth || !request.auth.token.email) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    let email;
    if (!request.data.email) {
        email = request.auth.token.email;
    } else {
        // Make sure the requester is an admin
        // if they are requesting someone else's info

        const requesterProfileDoc = await db
            .collection("data")
            .doc(request.auth.token.email)
            .get(); // emails are used as the document id
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

    const profile = await getUserProfileByEmail(email) ;

    if (request.data.location && profile) {
        updateChaserTargetLocation(profile, request.data.location)
    }
 
    return profile;
});
