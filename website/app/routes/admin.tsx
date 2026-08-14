import type { Route } from "../+types/root";
import { auth, functions } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Form, redirect } from "react-router"; 
import type { ClientTaggedOutResponse, Profile } from "../../../types";
import { TagOut } from "../../components/TagOut";
import { useSearchParams } from "react-router";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
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
    const adminProfileResult = (await getProfile({})).data; // always pass an object
    
    if (adminProfileResult && (adminProfileResult as Profile).role != "admin") {
        return redirect("/profile");
    }

    // Get the searchedProfile based on the URL parameters
    const url = new URL(request.url);
    const email = url.searchParams.get("q");

    let searchProfileResult;

    if (email) {
        searchProfileResult = (await getProfile({email: email})).data;
        console.log("Search profile result:", searchProfileResult);
    }

    return {
        adminProfile: adminProfileResult,
        searchProfile: searchProfileResult,
    };
}

export default function AdminPanel({ loaderData }: Route.ComponentProps) {
    const [searchParams] = useSearchParams();

    const { adminProfile, searchProfile } = loaderData as unknown as {
        adminProfile: Profile,
        searchProfile: Profile | null,
    };

    console.log(searchProfile);
    
    const tagOut = async () => {
        try {
            const email = searchParams.get("q");

            const tagOut = httpsCallable(functions, "tagOut");
            const tagOutResult = await tagOut({email: email});
            const data = tagOutResult.data as ClientTaggedOutResponse;
            if (data.status !== 200) {
                throw new Error("Failed to tag out");
            } 
        }   
        catch (err) {
            console.error("tagOut error:", err);
            throw err;
        }
    }

    return (
        <>
            <div className="p-6">
                <div className="text-lg pb-4">
                    Salutations, { adminProfile.firstName } { adminProfile.lastName }. The Gotcha admin panel is at your service.
                </div>
                
                <Form 
                    method="get"
                    className="flex gap-4"
                >
                    <input 
                        name="q" defaultValue="@milton.edu"
                        type="email"
                        placeholder="Find player by email..."
                        className="border-2 rounded-sm p-2 w-full"
                    />
                    <button 
                        type="submit"
                        className="bg-slate-100 text-white py-2 px-4 rounded-sm"
                    >
                        Submit
                    </button>
                </Form>

                {searchProfile ? (
                    <>
                        <h1 className="mt-8 font-bold text-xl">Profile</h1>
                        {/* name and profile image card */}
                        <div className="bg-slate-100 p-4 rounded-lg m-4 text-center items-center flex flex-col space-y-4">
                            <h2 className="text-2xl font-bold">{searchProfile.firstName} {searchProfile.lastName}</h2>
                        </div>
                        {searchProfile.alive ? (
                            <div className="m-4 flex flex-row gap-5">
                                <div className="bg-slate-100 px-10 py-8 rounded-lg text-center items-center flex flex-col flex-1">
                                    {/* tag counter */}
                                    <h2 className="text-xl font-semibold">Tags</h2>
                                    <h1 className="text-2xl font-bold">{searchProfile.tags}</h1>
                                </div>
                                <TagOut text="Tag Out" onConfirm={tagOut} />
                            </div>
                        ) : (
                            <div className="bg-slate-100 p-4 rounded-lg text-center items-center flex flex-col flex-1">
                                {/* tag counter */}
                                <h2 className="text-xl font-semibold">Tags</h2>
                                <h1 className="text-2xl font-bold">{searchProfile.tags}</h1>
                                (Player tagged out)
                            </div>
                        )}
                        {searchProfile.alive ? (
                            <div className="bg-slate-100 p-4 rounded-lg m-4 text-center items-center flex flex-col">
                                <h2 className="text-xl font-semibold">Target</h2>
                                <h1 className="text-2xl font-bold">{searchProfile.target.firstName} {searchProfile.target.lastName}</h1>
                                <p className="italic font-light text-slate-800">
                                    {searchProfile.target.email}
                                </p>
                            </div>
                        ) : null}
                    </>
                ) : <div className="mt-5">No user found with that email.</div>}
            </div>
        </>
        
    );
}