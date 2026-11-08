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
import { Spoiler } from "spoiled";
import { CHECKED_IN_RING, CheckInBadge, VerifiedCheck } from "../../components/CheckInBadge";
import { signOut } from "firebase/auth";

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
    settings: settingsResult.data,
  };
}

// check-in days are school days, in the school's time zone (the same as functions/src/schoolTime.ts)
const schoolDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function checkedInToday(checkedInAt: number | undefined) {
  return checkedInAt !== undefined && schoolDayFormat.format(checkedInAt) === schoolDayFormat.format(Date.now());
}

// e.g. 1200 -> "8:00 PM"
function formatDeadline(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

type SharingState = "idle" | "locating" | "shared" | "failed";

/**
 * Finds the player's location after the page has loaded, then sends it to getProfile,
 * which works out the building, shows it to their chaser, and checks them in.
 * The same call is the only one that can return their target's building when admins
 * have "share to see" on, so nothing extra is fetched for it.
 * Returns the profile from that call (null until it arrives) and `retry` to share again,
 * e.g. when they've walked into the check-in building.
 */
function useSharedLocation(enabled: boolean) {
  const [shared, setShared] = React.useState<Profile | null>(null);
  const [state, setState] = React.useState<SharingState>("idle");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setState("failed");
      alert(
        "Location isn't supported by your browser. Certain features might be unavailable.",
      );
      return;
    }

    let cancelled = false;
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const getProfile = httpsCallable<object, Profile | null>(functions, "getProfile");
          const result = await getProfile({
            location: [position.coords.latitude, position.coords.longitude],
          });
          if (cancelled) return;
          setShared(result.data);
          setState("shared");
        } catch (err) {
          // sharing location is best-effort, so the page keeps working without it
          console.error("location update failed:", err);
          if (!cancelled) setState("failed");
        }
      },
      () => {
        if (!cancelled) setState("failed"); // denied or unavailable: carry on without location
      },
      // a retry should use a fresh position, since they've probably moved
      { timeout: 10000, maximumAge: attempt === 0 ? 60000 : 0 },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { shared, state, retry };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { profile: loadedProfile, user, lastWords, settings } = loaderData as unknown as {
    profile: Profile;
    user: any;
    lastWords: ClientLastWordsResponse;
    settings: GameSettings;
  };


  const [alive, setAlive] = React.useState(loadedProfile.alive);
  // only players still in the game share their location, and only when something uses it
  // the target's building is a location feature, so it's all off when location is off
  const seeTargetLocation = settings.locationEnabled && settings.seeTargetLocation;
  const hiddenUntilShared = seeTargetLocation && settings.shareToSeeTargetLocation;
  const { shared, state: sharing, retry } = useSharedLocation(
    loadedProfile.alive && loadedProfile.role === "player" &&
      (settings.locationEnabled || settings.checkInEnabled),
  );
  // the profile from the location call is newer (building, check-in, target's building)
  const profile = shared ?? loadedProfile;

  // null keeps it under the sand. with "share to see" on, the server only sends it back once we've shared
  const targetLocation = profile.target.location ?? null;
  const showTargetLocation =
    seeTargetLocation && (hiddenUntilShared ? sharing !== "shared" || targetLocation !== null : targetLocation !== null);
  const isCheckedIn = checkedInToday(profile.checkedInAt);
  const navigate = useNavigate();
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const showCheckedIn = alive && settings.checkInEnabled && isCheckedIn;

  const signUserOut = async () => {
    await signOut(auth);
    window.location.reload();
  };

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
          <div
            className={`bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col space-y-2 ${showCheckedIn ? CHECKED_IN_RING : ""}`}
          >
            {user.photoURL && !photoFailed ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="rounded-full w-24 h-24 object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              // no Google photo (or it didn't load), so show their initials
              <div className="rounded-full w-24 h-24 bg-slate-600 flex items-center justify-center text-3xl font-bold text-slate-200">
                {profile.firstName?.[0]}
                {profile.lastName?.[0]}
              </div>
            )}
            <h2 className="text-2xl font-bold pt-2">
              {profile.firstName} {profile.lastName}
              {showCheckedIn && (
                <VerifiedCheck
                  tooltip={`You're checked in for today. Check in again tomorrow at ${settings.checkInBuilding ?? "any building"} by ${formatDeadline(settings.checkInDeadline)}.`}
                />
              )}
            </h2>
            {profile.location && (
              <h2 className="italic font-light text-slate-300">{profile.location}</h2>
            )}
            {alive && settings.checkInEnabled && (
              <CheckInBadge
                checkedIn={isCheckedIn}
                building={settings.checkInBuilding}
                deadline={formatDeadline(settings.checkInDeadline)}
                locating={sharing === "locating"}
                hint={
                  sharing === "failed"
                    ? "check-in needs your location"
                    : sharing === "shared" && !profile.location
                      ? "you're not in a building"
                      : null
                }
                onCheckIn={retry}
              />
            )}
            <button className="text-sm text-slate-400 hover:text-white pt-1" onClick={signUserOut}>
              Sign out
            </button>
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
              {showTargetLocation && (
                <div className="mt-2 flex flex-col items-center">
                  {/* revealOn false: only sharing their location reveals it, not a tap or hover */}
                  <Spoiler
                    hidden={hiddenUntilShared && sharing !== "shared"}
                    revealOn={false}
                    theme="dark"
                    className="text-lg font-semibold"
                  >
                    {targetLocation ?? "Somewhere on campus"}
                  </Spoiler>
                  {hiddenUntilShared && sharing !== "shared" && (
                    <p className="text-xs text-slate-400 mt-1">
                      {sharing === "failed"
                        ? "Turn on your location to see where your target is."
                        : "Share your location to see where your target is."}
                    </p>
                  )}
                </div>
              )}
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
