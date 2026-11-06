import { LeaderboardCard } from "../../components/LeaderboardCard";
import type { Route } from "../+types/root";
import React from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import type { GameSettings, Leaderboard } from "../../../types";

export async function clientLoader() {
  // pull the leaderboard, and the game times (set by admins) for the countdown
  const getLeaderboard = httpsCallable(functions, "getLeaderboard");
  const getGameSettings = httpsCallable<unknown, GameSettings>(functions, "getGameSettings");

  const [leaderboardResult, settingsResult] = await Promise.all([
    getLeaderboard({}),
    getGameSettings({}),
  ]);

  return {
    startsAt: settingsResult.data.startsAt,
    endsAt: settingsResult.data.endsAt,
    leaderboard: (leaderboardResult as any).data.leaderboard as Leaderboard,
  };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  // @ts-expect-error
  const { startsAt, endsAt, leaderboard } = loaderData;
  const [timeRemaining, setTimeRemaining] = React.useState<string>("");

  console.log(leaderboard);

  React.useEffect(() => {
    function formatDiff(diff: number) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    function updateTimeRemaining() {
      const now = Date.now();

      if (startsAt !== null && now < startsAt) {
        setTimeRemaining(`Starts in ${formatDiff(startsAt - now)}`);
        return;
      }
      // no end time set yet, so there's nothing to count down to
      if (endsAt === null) {
        setTimeRemaining("");
        return;
      }
      if (now >= endsAt) {
        setTimeRemaining("Gotcha is Over!");
        return;
      }
      setTimeRemaining(formatDiff(endsAt - now));
    }

    updateTimeRemaining();
    const intervalId = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(intervalId);
  }, [startsAt, endsAt]);

  return (
    <div className="flex flex-col sm:flex-col md:flex-row flex-1 p-8 items-center">
      <div className="space-y-2">
        <h1 className="font-bold text-xl">Leaderboard</h1>
        {
          leaderboard &&
          leaderboard.topTaggers && 
          leaderboard.topTaggers.map(({ name , tags }: { name: string; tags: number }, index: number) => (
            <LeaderboardCard
              name={name}
              tags={tags}
              position={index + 1}
              key={index}
            />
          ))
        }
      </div>

      <div className="flex flex-1 flex-col items-center justify-start p-4 rounded-xl space-y-8">
        <h1 className="text-red-500 text-4xl text-center font-bold">
          {timeRemaining}
        </h1>
        <div className="flex w-full justify-around space-x-8">
          <div className="flex-1">
            <h1 className="font-bold text-xl text-white mb-4 text-center">
              Classes
            </h1>
            <div className="space-y-2">
              {leaderboard && leaderboard.byClass.map((classEntry: { class: string; tags: number }) => (
                <div
                  key={classEntry.class}
                  className="flex justify-between p-3 bg-slate-700 rounded-lg"
                >
                  <h2 className="font-medium capitalize">{classEntry.class}</h2>
                  <h2 className="font-bold">{classEntry.tags}</h2>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-xl text-white mb-4 text-center">
              Dorms
            </h1>
            <div className="space-y-2">
              {leaderboard && leaderboard.byDorms.map((dormEntry: { dorm: string; tags: number }) => (
                <div
                  key={dormEntry.dorm}
                  className="flex justify-between p-3 bg-slate-700 rounded-lg"
                >
                  <h2 className="font-medium capitalize">{dormEntry.dorm}</h2>
                  <h2 className="font-bold">{dormEntry.tags}</h2>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
