import type { Route } from "../../+types/root";
import { auth, functions, refreshAdminClaim } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { redirect } from "react-router";
import type { GameSettings, Profile } from "../../../../types";
import { useEffect, useState } from "react";
// compiled in from geofence/buildings.geojson by scripts/generate-buildings.mjs
import { BUILDING_NAMES } from "../../generated/buildings";

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

  const getProfile = httpsCallable<object, Profile | null>(functions, "getProfile");
  const adminProfileResult = (await getProfile({})).data; // always pass an object

  if (adminProfileResult?.role != "admin") {
    return redirect("/app/profile");
  }

  // updateGameSettings checks the admin claim on our token,
  // so refresh it if getProfile just set it
  await refreshAdminClaim(adminProfileResult);

  const getGameSettings = httpsCallable<unknown, GameSettings>(functions, "getGameSettings");
  const settings = (await getGameSettings({})).data;

  return {
    adminProfile: adminProfileResult,
    settings,
  };
}

// <input type="datetime-local"> works in local time without a timezone, e.g. "2026-03-02T08:00"
function toLocalInput(ms: number | null) {
  if (ms === null) return "";
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return value ? new Date(value).getTime() : null;
}

// <input type="time"> uses "HH:MM". the deadline is stored as minutes after midnight
function toTimeInput(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function fromTimeInput(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

// a select can't hold null, so "" stands for any building
const ANY_BUILDING = "";

// the same countdown format as the leaderboard
function formatCountdown(diff: number) {
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function Countdown({ startsAt, endsAt }: Pick<GameSettings, "startsAt" | "endsAt">) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  let time = "";
  let caption = "No end time set";
  if (startsAt !== null && now < startsAt) {
    time = formatCountdown(startsAt - now);
    caption = "until Gotcha starts";
  } else if (endsAt !== null && now >= endsAt) {
    time = "Gotcha is Over!";
    caption = "";
  } else if (endsAt !== null) {
    time = formatCountdown(endsAt - now);
    caption = "until Gotcha ends";
  }

  return (
    <div className="flex flex-col items-center p-4">
      {time && <h1 className="text-red-500 text-4xl text-center font-bold">{time}</h1>}
      {caption && <p className="text-slate-300">{caption}</p>}
    </div>
  );
}

function FeatureRow({
  title,
  description,
  on,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-between items-center gap-4 p-3 bg-slate-700 rounded-lg">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-slate-300">{description}</p>
      </div>
      <OnOffButton on={on} disabled={disabled} onClick={onClick} />
    </div>
  );
}

function OnOffButton({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className={`w-14 px-2 py-0.5 rounded text-white text-sm disabled:opacity-50 ${on ? "bg-green-600 hover:bg-green-700" : "bg-slate-600 hover:bg-slate-500"}`}
      onClick={onClick}
      disabled={disabled}
    >
      {on ? "On" : "Off"}
    </button>
  );
}

export default function GameplayPanel({ loaderData }: Route.ComponentProps) {
  const { settings: initialSettings } = loaderData as unknown as {
    adminProfile: Profile;
    settings: GameSettings;
  };

  const [settings, setSettings] = useState(initialSettings);
  const [startsAt, setStartsAt] = useState(initialSettings.startsAt);
  const [endsAt, setEndsAt] = useState(initialSettings.endsAt);
  const [checkInDeadline, setCheckInDeadline] = useState(initialSettings.checkInDeadline);
  const [checkInBuilding, setCheckInBuilding] = useState(initialSettings.checkInBuilding);
  const [saving, setSaving] = useState(false);

  const scheduleChanged = startsAt !== settings.startsAt || endsAt !== settings.endsAt;
  const checkInChanged =
    checkInDeadline !== settings.checkInDeadline || checkInBuilding !== settings.checkInBuilding;
  const scheduleInvalid = startsAt !== null && endsAt !== null && startsAt >= endsAt;

  // saves some settings, and keeps the page in step with what the server saved
  const save = async (changes: Partial<GameSettings>) => {
    setSaving(true);
    try {
      const updateGameSettings = httpsCallable<{ settings: Partial<GameSettings> }, GameSettings>(
        functions,
        "updateGameSettings",
      );
      const saved = (await updateGameSettings({ settings: changes })).data;
      setSettings(saved);
      setStartsAt(saved.startsAt);
      setEndsAt(saved.endsAt);
      setCheckInDeadline(saved.checkInDeadline);
      setCheckInBuilding(saved.checkInBuilding);
    } catch (err) {
      // the server's message says what went wrong
      console.error(err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <Countdown startsAt={settings.startsAt} endsAt={settings.endsAt} />

      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-slate-800 p-4 rounded-lg space-y-2">
          <h2 className="font-bold text-xl">Schedule</h2>
          <p className="text-sm text-slate-300">
            Players can only tag out between these times. Leave one empty for no limit.
          </p>
          {[
            { label: "Starts", value: startsAt, set: setStartsAt },
            { label: "Ends", value: endsAt, set: setEndsAt },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
              <h3 className="font-medium">{label}</h3>
              <div className="flex items-center gap-2">
                {value !== null && (
                  <button className="text-sm text-slate-300 hover:text-white" onClick={() => set(null)}>
                    Clear
                  </button>
                )}
                <input
                  type="datetime-local"
                  value={toLocalInput(value)}
                  onChange={(e) => set(fromLocalInput(e.target.value))}
                  className="bg-slate-600 rounded px-2 py-1 text-white [color-scheme:dark]"
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end items-center gap-3 pt-1">
            {scheduleInvalid && <p className="text-sm text-red-500">The game has to end after it starts.</p>}
            {scheduleChanged && (
              <button
                className="px-3 py-1 rounded bg-slate-700 text-white text-sm hover:bg-slate-600 disabled:opacity-50"
                onClick={() => save({ startsAt, endsAt })}
                disabled={saving || scheduleInvalid}
              >
                {saving ? "Saving..." : "Save schedule"}
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-800 p-4 rounded-lg space-y-2">
          <h2 className="font-bold text-xl">Features</h2>
          <FeatureRow
            title="Revenge loop"
            description="When a player is tagged out, everyone they tagged comes back."
            on={settings.revengeEnabled}
            disabled={saving}
            onClick={() => save({ revengeEnabled: !settings.revengeEnabled })}
          />
          <FeatureRow
            title="Location"
            description="Phones report which building players are in."
            on={settings.locationEnabled}
            disabled={saving}
            onClick={() => save({ locationEnabled: !settings.locationEnabled })}
          />
          <FeatureRow
            title="See target location"
            description="Chasers see which building their target is in. When off, it's still saved but never sent to players."
            on={settings.seeTargetLocation}
            disabled={saving}
            onClick={() => save({ seeTargetLocation: !settings.seeTargetLocation })}
          />
          <FeatureRow
            title="Share to see"
            description="Players only see their target's location while they're sharing their own."
            on={settings.shareToSeeTargetLocation}
            disabled={saving}
            onClick={() => save({ shareToSeeTargetLocation: !settings.shareToSeeTargetLocation })}
          />
        </div>

        <div className="bg-slate-800 p-4 rounded-lg space-y-2">
          <FeatureRow
            title="Daily check-in"
            description="Every school day, alive players have to open Gotcha in the check-in building before the deadline, or they're taken out of the game (nobody gets a tag)."
            on={settings.checkInEnabled}
            disabled={saving}
            onClick={() => save({ checkInEnabled: !settings.checkInEnabled })}
          />
          {settings.checkInEnabled && (
            <>
              <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
                <h3 className="font-medium">Deadline (school time)</h3>
                <input
                  type="time"
                  value={toTimeInput(checkInDeadline)}
                  onChange={(e) => e.target.value && setCheckInDeadline(fromTimeInput(e.target.value))}
                  className="bg-slate-600 rounded px-2 py-1 text-white [color-scheme:dark]"
                />
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
                <h3 className="font-medium">Building</h3>
                <select
                  value={checkInBuilding ?? ANY_BUILDING}
                  onChange={(e) => setCheckInBuilding(e.target.value === ANY_BUILDING ? null : e.target.value)}
                  className="bg-slate-600 rounded px-2 py-1 text-white"
                >
                  <option value={ANY_BUILDING}>Any building</option>
                  {BUILDING_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {checkInChanged && (
                <div className="flex justify-end pt-1">
                  <button
                    className="px-3 py-1 rounded bg-slate-700 text-white text-sm hover:bg-slate-600 disabled:opacity-50"
                    onClick={() => save({ checkInDeadline, checkInBuilding })}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save check-in"}
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-400">
                Turning this on or moving the deadline after today's deadline has passed starts with tomorrow.
              </p>
            </>
          )}
        </div>

        <p className="text-sm text-slate-400 text-center">
          {settings.updatedAt !== null && settings.updatedBy !== null
            ? `Last changed by ${settings.updatedBy} on ${new Date(settings.updatedAt).toLocaleString()}. Changes reach everyone within 30 seconds.`
            : "Nothing has been changed yet."}
        </p>
      </div>
    </div>
  );
}
