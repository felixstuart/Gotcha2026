import { beforeAll, describe, it, expect } from 'vitest';
import { seedProfiles } from '../../seed';
import { Profile } from "../../types";

beforeAll(async () => {
    await seedProfiles();
});

import { getUserProfileByEmail } from './getProfile';

describe("getUserProfileByEmail", () => {
    it("gets existing user's profile", async () => {
        const foundAlexProfile = await getUserProfileByEmail("alex_chen@milton.edu");
        const trueAlexProfile =  {
            alive: true,
            role: "player",
            firstName: "Alex",
            lastName: "Chen",
            class: "senior",
            dayorboard: "wolcott",
            tags: 0,
            chaser: "felix_stuart27@milton.edu",
            target: {
                firstName: "Jordan",
                lastName: "Lee",
                email: "jordan_lee@milton.edu",
                location: "Pritzker",
            },
        } as Profile;

        
        console.log(foundAlexProfile);
        expect(foundAlexProfile).toEqual(trueAlexProfile);
    });
});
