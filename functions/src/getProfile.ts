import { requireRegisteredSchoolUser, requestedEmail } from "./authorization";
import { syncRoleClaim } from "./auth";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { GameSettings, Profile, Role } from "../../types";
import { db } from "./firebase";
import { getSettings } from "./settings";
import { buildingAt, Location } from "./buildings";
import { checkedInToday } from "./schoolTime";

export type { Location };

/**
 * Updates target.location for the chaser
 * so we can say where the chaser tagged their target out
 * (improves efficiency since Gotcha is read, not write heavy)
 * @param targetProfile
 * @param targetLocation
 * @returns the building they're in, or null if they're in none
 */
export const updateChaserTargetLocation = async (
    targetProfile: Profile,
    targetLocation: Location,
    building = buildingAt(targetLocation),
): Promise<string | null> => {
    if (!building) {
        console.log("no building found"); // todo, maybe fix this silent failure
        return null;
    }

    targetProfile.location = building;
    if (targetProfile.chaser && targetProfile.chaser !== "none") {
        try {
            await db.collection("data").doc(targetProfile.chaser).update({
              "target.location": building,
            });
        } catch (err) {
            // e.g. the chaser's profile was deleted. sharing a location is best-effort,
            // so it shouldn't stop the player's own profile from loading
            console.error("couldn't save the building for the chaser:", err);
        }
    }
    return building;
};

/**
 * Checks a player in if they're in the check-in building (or any building) and haven't
 * checked in yet today. Costs one write, at most once per player per school day.
 * Updates the passed profile so the response shows it.
 * @returns whether this call checked them in
 */
export const checkIn = async (
    email: string,
    profile: Profile,
    building: string | null,
    settings: GameSettings,
    now = Date.now(),
): Promise<boolean> => {
    if (!settings.checkInEnabled || !building) return false;
    if (settings.checkInBuilding !== null && settings.checkInBuilding !== building) return false;
    if (checkedInToday(profile.checkedInAt, now)) return false; // already done, so no write

    await db.collection("data").doc(email).update({ checkedInAt: now });
    profile.checkedInAt = now;
    return true;
};

/**
 * Whether a player may see their target's building in this response.
 * @param settings
 * @param sharedLocation whether this call came with their own location
 */
export function canSeeTargetLocation(settings: GameSettings, sharedLocation: boolean): boolean {
    // it's a location feature, so switching location off hides it too
    if (!settings.locationEnabled || !settings.seeTargetLocation) return false;
    return !settings.shareToSeeTargetLocation || sharedLocation;
}

/**
 * What a player gets back about themselves. Who is chasing them is the one thing the game
 * keeps from them, so `chaser` is blanked (not removed: the apps expect a string there),
 * and which admin last edited them is left out.
 */
export function forPlayer(profile: Profile): Profile {
    const { lastEditedBy: _by, lastEditedAt: _at, ...rest } = profile;
    return { ...rest, chaser: "" };
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
  // the roster role, not the token claim, which can outlive a demotion (see requireAdmin)
  const isAdmin = member.profile.role === "admin";
  const email = requestedEmail(request.data, member.email, isAdmin);
  const ownProfile = email === member.email;

    const profile = ownProfile ? member.profile : await getUserProfileByEmail(email);

    const location = request.data?.location;
    const sharedLocation = location !== undefined && location !== null;
    if (sharedLocation) {
        if (!Array.isArray(location) || location.length !== 2 ||
            !location.every((v: unknown) => typeof v === "number" && Number.isFinite(v)) ||
            Math.abs(location[0]) > 90 || Math.abs(location[1]) > 180) {
            throw new HttpsError("invalid-argument", "Invalid coordinates");
        }
        if (!ownProfile) {
            throw new HttpsError("permission-denied", "Only players make updates");
        }
    }

    // cached, so this almost never costs a read
    const settings = await getSettings();

    if (sharedLocation && profile && profile.alive && profile.role === "player" &&
        (settings.locationEnabled || settings.checkInEnabled)) {
        // the building is worked out once, in memory, and shared by both features
        const building = buildingAt(location as Location);
        if (building) profile.location = building;

        // admins can switch location off in the game settings.
        // check-in still works without it (it only needs this call's location)
        await Promise.all([
            settings.locationEnabled ?
                updateChaserTargetLocation(profile, location as Location, building) :
                null,
            checkIn(email, profile, building, settings),
        ]);
    }

    if (ownProfile) {
        await trySyncRoleClaim(request, member.profile.role);
    }

    // the building stays saved either way, it's only left out of what players get back.
    // admins always see it
    if (!profile || isAdmin) return profile;

    if (profile.target?.location !== undefined && !canSeeTargetLocation(settings, sharedLocation)) {
        return forPlayer({ ...profile, target: { ...profile.target, location: undefined } });
    }

    return forPlayer(profile);
});
