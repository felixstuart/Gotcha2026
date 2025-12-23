"use client";
import { app, auth, functions } from "firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { redirect, useNavigate } from "react-router";
import GotchaLoader from "components/GotchaHand";
import type { Route } from "../+types/root";
import type { ClientProfile, ClientTaggedOutResponse } from "../../../types";
import { TagOut } from "components/TagOut";
import React from "react";

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

  const profileResult = await getProfile({}); // always pass an object
  console.log(profileResult.data);
  return { profile: profileResult.data, user: user };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { profile, user } = loaderData as unknown as {
    profile: ClientProfile;
    user: any;
  };

  const [alive, setAlive] = React.useState(profile.alive);
  const navigate = useNavigate();

  const tagOut = async () => {
    console.log("tagOut() invoked");
    try {
      const tagOut = httpsCallable(functions, "tagOut");
      const tagOutResult = await tagOut({});
      const data = tagOutResult.data as ClientTaggedOutResponse;
      if (data.status !== 200) {
        throw new Error("Failed to tag out");
      }
      setAlive(false);
      navigate("/app/last-words");
    } catch (err) {
      console.error("tagOut error:", err);
      throw err;
    }
  };

  return (
    <div className="p-4">
      {/* set of cards */}
      <h1>Profile</h1>
      {/* name and profile image card */}
      <div className="bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col space-y-4">
        <img src={user.photoURL} className="rounded-full" />
        <h2 className="text-2xl font-bold">{profile.name}</h2>
      </div>
      {alive ? (
        <div className="flex space-x-2">
          <div className="bg-slate-800 p-4 rounded-lg text-center items-center flex flex-col flex-1">
            {/* tag counter */}
            <h2 className="text-xl font-semibold">Tags</h2>
            <h1 className="text-2xl font-bold">{profile.tags}</h1>
          </div>
          <TagOut text="Tag Out" onConfirm={tagOut} />
        </div>
      ) : (
        <div className="bg-slate-800 p-4 rounded-lg text-center items-center flex flex-col flex-1">
          {/* tag counter */}
          <h2 className="text-xl font-semibold">Tags</h2>
          <h1 className="text-2xl font-bold">{profile.tags}</h1>
        </div>
      )}
    </div>
  );
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
