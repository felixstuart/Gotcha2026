import { beforeAll, describe, it, expect } from 'vitest';
import { seedProfiles } from '../../seed';
import { Profile } from "../../types";
import { 
    getUserProfileByEmail, 
    updateChaserTargetLocation, 
    getProfile,
    Location 
} from './getProfile';
import firebaseFunctionsTest from "firebase-functions-test";
import { pointIn } from "./testBuildings";

const testEnv = firebaseFunctionsTest();

beforeAll(async () => {
    await seedProfiles();
});

describe("getUserProfileByEmail", () => {
    it("gets existing user's profile", async () => {
        const foundJordanProfile = await getUserProfileByEmail("jordan_lee@milton.edu");
        const trueJordanProfile =  {
        alive: true,
        role: "player",
        firstName: "Jordan",
        lastName: "Lee",
        class: "sophomore",
        dayorboard: "day",
        tags: 0,
        chaser: "alex_chen@milton.edu",
        target: {
            firstName: "Isaac",
            lastName: "Wu",
            email: "isaac_wu28@milton.edu",
            location: "FMC",
        },
    } as Profile;

        expect(foundJordanProfile).toEqual(trueJordanProfile);
    });
    
    it("returns null when there is no profile", async () => {
        const result = await getUserProfileByEmail("akfjd@milton.edu");
        expect(result).toBe(null);
    });
});

describe("updateChaserTargetLocation", () => {
    // the real buildings, compiled in from geofence/buildings.geojson
    const testPoints = {
        science: pointIn("Science Building"),
        outside: [42.30000, -71.10000],
    };

    let jordanProfile: Profile;
    beforeAll(async () => {
        const profile = await getUserProfileByEmail("jordan_lee@milton.edu");
        if (!profile) throw new Error("Jordan Lee's profile should be seeded");
        jordanProfile = profile;
    });

    it("updates chaser target location when in building", async () => {
        const location = testPoints.science as Location;
        expect(jordanProfile.chaser).toBe("alex_chen@milton.edu");

        await updateChaserTargetLocation(jordanProfile, location);
        const chaserProfile = await getUserProfileByEmail("alex_chen@milton.edu");
        const targetLocationForChaser = chaserProfile?.target.location;

        expect(targetLocationForChaser).toBe("Science Building");
    });

    it("doesn't change location when user is outside building", async () => {
        const originalChaserProfile = await getUserProfileByEmail("alex_chen@milton.edu");
        if (!originalChaserProfile) {
            throw new Error("Alex Chen's profile should exist");
        }

        const originalChaserTargetLocation = await originalChaserProfile?.target.location;

        const location = testPoints.outside as Location;
        await updateChaserTargetLocation(jordanProfile, location);

        const newChaserProfile = await getUserProfileByEmail("alex_chen@milton.edu");
        const newChaserTargetLocation = await newChaserProfile?.target.location;

        expect(originalChaserTargetLocation).toEqual(newChaserTargetLocation);
    })
});

describe("getProfile", () => {
    it("makes no location updates for admin reads", async () => {
        const wrappedGetProfile = testEnv.wrap(getProfile);
        const email = "alex_chen@milton.edu";
        const auth = {
            uid: "isaac-admin",
            token: { email: "isaac_wu28@milton.edu", email_verified: true, admin: true },
        };
        const chaserBefore = await getUserProfileByEmail("felix_stuart27@milton.edu");
        const result = await wrappedGetProfile({ data: { email }, auth } as any);
        expect(result?.firstName).toBe("Alex");
        await expect(wrappedGetProfile({
            data: { email, location: pointIn("Science Building") }, auth,
        } as any)).rejects.toMatchObject({ code: "permission-denied" });
        const chaserAfter = await getUserProfileByEmail("felix_stuart27@milton.edu");
        expect(chaserAfter?.target.location).toBe(chaserBefore?.target.location);
    });
});
