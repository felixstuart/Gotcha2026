import { beforeAll, describe, it, expect } from 'vitest';
import { seedProfiles } from '../../seed';
import { Profile } from "../../types";
import { 
    getUserProfileByEmail, 
    updateChaserTargetLocation, 
    Location 
} from './getProfile';

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

describe("updateChaserTargetLocation", async () => {
    const testPoints = {
        stuartEmpire: [42.25809, -71.06605],
        fmc: [42.25836, -71.06600],
        quad: [42.25800, -71.06560],
        outside: [42.25900, -71.06700],
    };

    const jordanProfile = await getUserProfileByEmail("jordan_lee@milton.edu");
    if (!jordanProfile) {
        throw new Error("Jordan Lee's profile should be seeded");
    }

    it("updates chaser target location when in building", async () => {
        const location = testPoints.stuartEmpire as Location;
        expect(jordanProfile.chaser).toBe("alex_chen@milton.edu");

        await updateChaserTargetLocation(jordanProfile, location);
        const chaserProfile = await getUserProfileByEmail("alex_chen@milton.edu");
        const targetLocationForChaser = chaserProfile?.target.location;

        expect(targetLocationForChaser).toBe("Stuart Empire");
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