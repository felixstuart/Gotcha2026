"use client";
import { app, auth, functions } from "../../firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { redirect, useNavigate } from "react-router";
import GotchaLoader from "../../components/GotchaHand";
import type { Route } from "../+types/root";
import type {
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

  const location = await new Promise<GeolocationPosition | null>((resolve) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(position)
        }, 
        (error) => {
          resolve(null)
        }
      )
    } else {
      alert("Location isn't supported by your browser. Certain features might be unavailable.")
      resolve(null)
    }
  })
  
  const getProfile = httpsCallable(functions, "getProfile");

  const profileResult = await getProfile({location: [location?.coords.latitude, location?.coords.longitude]}); // always pass an object
  const getLastWords = httpsCallable(functions, "getLastWords");
  const lastWordsResult = await getLastWords({});

  return {
    // @ts-ignore
    profile: profileResult.data.profile,
    user: user,
    lastWords: lastWordsResult.data,
  };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { profile, user, lastWords } = loaderData as unknown as {
    profile: any;
    user: any;
    lastWords: ClientLastWordsResponse;
  };

  console.log(profile)

  const [alive, setAlive] = React.useState(profile.alive);
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
            <h2 className="text-2xl font-bold">{profile.firstName} {profile.lastName}</h2>
            <h2 className="italic font-light text-slate-300">{profile.location}</h2>
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
              <h1 className="text-2xl font-bold">{profile.target.firstName} {profile.target.lastName}</h1>
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
              <div key={lw.timestamp} className="bg-slate-800 p-4 rounded-lg m-4">
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
      <>
        <h1
          className="text-white p-6"
        >
          You're an admin. Why are you playing? Go to the /app/admin page.
        </h1>
      </>
    )
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

export function HydrateFallback() {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      <GotchaLoader />
    </div>
  );
}
