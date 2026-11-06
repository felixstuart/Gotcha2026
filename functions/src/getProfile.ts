import { requireRegisteredSchoolUser, requestedEmail } from "./authorization";
import { hasAdminClaim, syncRoleClaim } from "./auth";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { Profile, Role } from "../../types";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { db } from "./firebase";
import { getSettings } from "./settings";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson"; // Uses (longitude, latitude) be careful

export type Location = [latitude: number, longitude: number];

/**
 * The named building footprints players can be in.
 * They live in config/buildings, written by seed.ts from geofence/buildings.geojson
 * (name them with geofence/labeler.html). Firestore can't store nested arrays,
 * so the FeatureCollection is saved as a JSON string.
 */
async function loadBuildings(): Promise<Feature<Polygon | MultiPolygon>[]> {
    const buildingsDoc = await db.collection("config").doc("buildings").get();
    const geojson = buildingsDoc.data()?.geojson;
    if (!geojson) return [];

    // footprints nobody has named yet aren't geofenced
    return (JSON.parse(geojson) as FeatureCollection).features.filter(
        (f): f is Feature<Polygon | MultiPolygon> =>
            !!f.properties?.name &&
            (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"),
    );
}

/**
 * Updates target.location for the chaser
 * so we can say where the chaser tagged their target out
 * (improves efficiency since Gotcha is read, not write heavy)
 * @param targetProfile
 * @param targetLocation
 */
export const updateChaserTargetLocation = async (targetProfile: Profile, targetLocation: Location): Promise<void> => {
    const buildings = await loadBuildings();

    const building = buildings.find((building) => (
        booleanPointInPolygon(
            point([targetLocation[1], targetLocation[0]]),
            building,
        )
    ));

    if (building) {
        const buildingName = building.properties?.name || "Unknown Location"
        targetProfile.location = buildingName;

        if (targetProfile.chaser && targetProfile.chaser !== "none") {
            await db.collection("data").doc(targetProfile.chaser).update({
              "target.location" : buildingName
            })
        }
    } else {
        console.log("no building found"); // todo, maybe fix this silent failure
    }
}

/**
 * Get a profile based on an email.
 * Assumes you've already validated permissions.
 * Outputs null if no profile found.
 * @param userEmail
 * @returns
 */
export const getUserProfileByEmail = async (userEmail: string): Promise<Profile | null> => {
    const profileDocument = await db.collection("data").doc(userEmail).get(); // emails used as document id
    const profile = profileDocument.data() as Profile | undefined;
    if (!profile) return null;
    return profile;
}

// a failed claim sync should never stop the profile from loading
async function trySyncRoleClaim(request: CallableRequest, role: Role): Promise<void> {
    try {
        await syncRoleClaim(request, role);
    } catch (err) {
        console.error("role claim sync failed:", err);
    }
}

/**
 * Firebase callable that returns the user's profile, or (admins only) another
 * player's profile, or null when there is no such profile.
 * Only players on the roster get in (see requireRegisteredSchoolUser).
 *
 * Loading your own profile also keeps your `admin` claim in step with your role.
 * When it changes, the client sees its token disagree with the returned role and
 * refreshes the token (see refreshAdminClaim in website/firebase.ts).
 */
export const getProfile = onCall(async (request): Promise<Profile | null> => {
  const member = await requireRegisteredSchoolUser(request);
  const email = requestedEmail(request.data, member.email, hasAdminClaim(request));
  const ownProfile = email === member.email;

    const profile = ownProfile ? member.profile : await getUserProfileByEmail(email);

    const location = request.data?.location;
    if (location !== undefined && location !== null) {
        if (!Array.isArray(location) || location.length !== 2 ||
            !location.every((v: unknown) => typeof v === "number" && Number.isFinite(v)) ||
            Math.abs(location[0]) > 90 || Math.abs(location[1]) > 180) {
            throw new HttpsError("invalid-argument", "Invalid coordinates");
        }
        if (!ownProfile) {
            throw new HttpsError("permission-denied", "Only players make updates");
        }
        // admins can switch location off in the game settings
        if (profile && profile.alive && profile.role === "player" &&
            (await getSettings()).locationEnabled) {
            await updateChaserTargetLocation(profile, location as Location);
        }
    }

    if (ownProfile) {
        await trySyncRoleClaim(request, member.profile.role);
    }

    return profile;
});
