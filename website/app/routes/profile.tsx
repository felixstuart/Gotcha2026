"use client";
import { app, auth, functions, refreshAdminClaim } from "../../firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { redirect, useNavigate } from "react-router";
import type { Route } from "../+types/root";
import type {
  GameSettings,
  ClientLastWordsResponse,
  Profile,
  ClientTaggedOutResponse,
  LastWordsEntry,
} from "../../../types";
import { TagOut } from "../../components/TagOut";
import React from "react";
import LocationService from "../../components/LocationService";

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


  // location isn't fetched here: waiting for it (up to 10s) would hold up the whole page.
  // the page shares it in the background once it's showing (see useSharedLocation)
  const getProfile = httpsCallable<object, Profile | null>(functions, "getProfile");
  const getGameSettings = httpsCallable<unknown, GameSettings>(functions, "getGameSettings");

  const [profileResult, settingsResult] = await Promise.all([
    getProfile({}), // always pass an object
    getGameSettings({}),
  ]);
  const profile = profileResult.data;
  if (!profile) throw new Error("No Gotcha profile found for your account");

  // getProfile may have just changed our admin claim to match our role
  await refreshAdminClaim(profile);

  // admins don't play, so send them straight to the admin panel
  if (profile.role == "admin") {
    return redirect("/app/admin/users");
  }

  const getLastWords = httpsCallable(functions, "getLastWords");
  const lastWordsResult = await getLastWords({});


  return {
    profile,
    user: user,
    lastWords: lastWordsResult.data,
    // only ask for location while admins have the location feature switched on
    locationEnabled: settingsResult.data.locationEnabled,
  };
}

/**
 * Finds the player's location after the page has loaded, then sends it to getProfile,
 * which works out the building and shows it to their chaser.
 * Returns the building name once it's known (or null if there isn't one).
 */
function useSharedLocation(enabled: boolean) {
  const [building, setBuilding] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      alert(
        "Location isn't supported by your browser. Certain features might be unavailable.",
      );
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const getProfile = httpsCallable<object, Profile | null>(functions, "getProfile");
          const result = await getProfile({
            location: [position.coords.latitude, position.coords.longitude],
          });
          const location = result.data?.location;
          if (!cancelled && location) setBuilding(location);
        } catch (err) {
          // sharing location is best-effort, so the page keeps working without it
          console.error("location update failed:", err);
        }
      },
      () => {}, // denied or unavailable: carry on without location
      { timeout: 10000, maximumAge: 60000 },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return building;
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { profile, user, lastWords, locationEnabled } = loaderData as unknown as {
    profile: any;
    user: any;
    lastWords: ClientLastWordsResponse;
    locationEnabled: boolean;
  };


  const [alive, setAlive] = React.useState(profile.alive);
  // only players still in the game share their location
  const building = useSharedLocation(locationEnabled && profile.alive && profile.role === "player");
  const navigate = useNavigate();

  const tagOut = async () => {
    try {
      const tagOut = httpsCallable(functions, "tagOut");
      const tagOutResult = await tagOut({});
      const data = tagOutResult.data as ClientTaggedOutResponse;
      if (data.status !== 200) {
        throw new Error("Failed to tag out");
      }
      setAlive(false);
      navigate("/app/last-words", {
        state: { canSubmit: true },
        viewTransition: true,
      });
    } catch (err) {
      console.error("tagOut error:", err);
      throw err;
    }
  };

  if (profile.role != "admin") {
    return (
      <>
        <div className="p-4">
          {/* set of cards */}
          <h1 className="font-bold text-xl">Profile</h1>
          {/* name and profile image card */}
          <div className="bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col space-y-4">
            <img src={user.photoURL} className="rounded-full" />
            <h2 className="text-2xl font-bold">
              {profile.firstName} {profile.lastName}
            </h2>
            <h2 className="italic font-light text-slate-300">
              {building ?? profile.location}
            </h2>
          </div>
          {alive ? (
            <div className="m-4 flex-col space-y-4">
              <div className="bg-slate-800 p-4 rounded-lg text-center items-center flex flex-col flex-1">
                {/* tag counter */}
                <h2 className="text-xl font-semibold">Tags</h2>
                <h1 className="text-2xl font-bold">{profile.tags}</h1>
              </div>
              <TagOut text="Tag Out" onConfirm={tagOut} />
            </div>
          ) : (
            <div className="bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col flex-1">
              {/* tag counter */}
              <h2 className="text-xl font-semibold">Tags</h2>
              <h1 className="text-2xl font-bold">{profile.tags}</h1>
            </div>
          )}
          {alive ? (
            <div className="bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col">
              <h2 className="text-xl font-semibold">Target</h2>
              <h1 className="text-2xl font-bold">
                {profile.target.firstName} {profile.target.lastName}
              </h1>
              <p className="italic font-light text-slate-300">
                {profile.target.email}
              </p>
            </div>
          ) : null}
        </div>
        <div className="p-4">
          <h1 className="font-bold text-xl">Last Words</h1>
          <div>
            {lastWords.lastWords.map((lw: LastWordsEntry) => (
              <div
                key={lw.timestamp}
                className="bg-slate-800 p-4 rounded-lg m-4"
              >
                <p className="italic text-white">"{lw.lw}"</p>
                <p className="text-sm text-slate-300">
                  - {lw.author} at{" "}
                  {new Date(lw.timestamp).toLocaleString(undefined, {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  } else {
    return (
      <div className="p-4">
        <h1 className="font-bold text-xl">Profile</h1>
        <div className="bg-slate-800 p-4 rounded-lg m-4 text-center" onClick={() => navigate("/app/admin")}>
          <h2 className="text-2xl font-bold">Proceed to Admin Panel</h2>
          <p className="italic font-light text-slate-300">{user.email}</p>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      <div className=" flex items-center justify-center">
        <h1 className="w-full text-center text-6xl font-bold">Uh oh.</h1>
      </div>
      <div className="mb-8 w-full flex justify-center">
        <p className="text-sm text-red-300">{error.message}</p>
      </div>
    </div>
  );
}
