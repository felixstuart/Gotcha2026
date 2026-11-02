import type { Route } from "../../+types/root";
import { auth, functions } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Form, redirect } from "react-router";
import type { ClientTaggedOutResponse, Profile } from "../../../../types";
import { TagOut } from "../../../components/TagOut";
import { useSearchParams } from "react-router";
import { AllCommunityModule } from "ag-grid-community";
import { AgGridProvider } from "ag-grid-react";
import { useState } from "react";

function getGreeting() {
  const hour = new Date().getHours();
  const greetings =
    hour < 12
      ? ["Good morning", "Morning", "Rise and gotcha"]
      : hour < 17
        ? ["Good afternoon", "Good noon", "Happy gotchaing"]
        : ["Good evening", "Evening", "Have a gotcha-tastic evening"];

  return greetings[new Date().getDate() % greetings.length];
}

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
  // getProfile returns { profile, claimsChanged }
  const adminProfileData = (await getProfile({})).data as {
    profile?: Profile;
    claimsChanged?: boolean;
  } | null; // always pass an object
  const adminProfileResult = adminProfileData?.profile;

  if (adminProfileResult?.role != "admin") {
    return redirect("/app/profile");
  }

  // the admin-only calls below check the admin claim on our token,
  // so refresh it if the server just set it
  if (adminProfileData?.claimsChanged) {
    await auth.currentUser?.getIdToken(true);
  }

  // Get the searchedProfile based on the URL parameters
  const url = new URL(request.url);
  const email = url.searchParams.get("q");

  let searchProfileResult;

  if (email) {
    searchProfileResult =
      (
        (await getProfile({ email: email })).data as {
          profile?: Profile;
        } | null
      )?.profile ?? null;
    console.log("Search profile result:", searchProfileResult);
  }

  return {
    adminProfile: adminProfileResult,
    searchProfile: searchProfileResult,
  };
}

export default function UserPanel({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();

  const { adminProfile, searchProfile } = loaderData as unknown as {
    adminProfile: Profile;
    searchProfile: Profile | null;
  };

  const greeting = getGreeting();

  const [colDefs, setColDefs] = useState([
    { field: "firstName", headerName: "First Name" },
    { field: "lastName", headerName: "Last Name" },
    { field: "email", headerName: "Email" },
    { field: "taggedOut", headerName: "Alive" },
    
  ]);

  const tagOut = async () => {
    try {
      const email = searchParams.get("q");

      const tagOut = httpsCallable(functions, "tagOut");
      const tagOutResult = await tagOut({ email: email });
      const data = tagOutResult.data as ClientTaggedOutResponse;
      if (data.status !== 200) {
        throw new Error("Failed to tag out");
      }
    } catch (err) {
      console.error("tagOut error:", err);
      throw err;
    }
  };

  return (
    <div className="p-4 bg-slate-900 w-screen h-screen">
      <h1 className="text-2xl font-bold text-white">
        {greeting}, {adminProfile.firstName}.
      </h1>

      <div className="p-4">
        <AgGridProvider modules={AllCommunityModule}>
          
        </AgGridProvider>
      </div>
    </div>
  );
}
