import React, { useState } from "react";
import type { Route } from "../+types/root";
import { app, auth, functions } from "../../firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { redirect } from "react-router"; 
import type { ClientProfile } from "../../../types";

export async function clientLoader() {
    const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
        });
    });
    // @ts-expect-error
    if (!user || !user.email?.endsWith("@milton.edu")) {
        return redirect("/");
    }

    const getProfile = httpsCallable(functions, "getProfile");
    const profileResult = (await getProfile({})).data; // always pass an object

    // TODO: check the user is an admin here based on the role of the profileResult

    return {
        profile: profileResult,
        user: user,
    };
}

export default function AdminPanel({ loaderData }: Route.ComponentProps) {
    const { profile, user } = loaderData as unknown as {
        profile: ClientProfile,
        user: any;
    };

    console.log(profile);
    console.log(user);

    const [searchText, setSearchText] = useState("");

    return (
        <>
            <div className="p-6">
                <div className="text-lg pb-4">
                    Salutations, { profile.name.split(" ")[0] }. The Gotcha admin panel is at your service.
                </div>
                
                <input 
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search players by name or email..."
                    className="border-2 rounded-sm p-2 w-full"
                />
            </div>
        </>
        
    );
}