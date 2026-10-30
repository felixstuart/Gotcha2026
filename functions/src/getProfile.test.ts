import { beforeAll, describe, it, expect } from 'vitest';
import { seedProfiles } from '../../seed';
import { Profile } from "../../types";

beforeAll(async () => {
    await seedProfiles();
});

import { getUserProfileByEmail } from './getProfile';

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

        
        console.log(foundJordanProfile);
        expect(foundJordanProfile).toEqual(trueJordanProfile);
    });
});
