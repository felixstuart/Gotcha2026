import { LeaderboardCard } from "../../components/LeaderboardCard";
import type { Route } from "../+types/root";
import { remoteConfig } from "../../firebase";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import React from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import type { Leaderboard } from "../../../types";

export async function clientLoader() {
  await fetchAndActivate(remoteConfig); // fetch latest values
  const endDateValue = getValue(remoteConfig, "endDate");
  const endDate = endDateValue.asString();

  // pull the leaderboard
  const getLeaderboard = httpsCallable(functions, "getLeaderboard");

  const leaderboard = ((await getLeaderboard({})) as any).data.leaderboard;

  return {
    endDate: endDate,
    leaderboard: leaderboard as unknown as Leaderboard,
  };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  // @ts-expect-error
  const { endDate, leaderboard } = loaderData;
  const [timeRemaining, setTimeRemaining] = React.useState<string>("");

  console.log(leaderboard);

  React.useEffect(() => {
    function updateTimeRemaining() {
      const end = new Date("2026-01-01T20:00").getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining("Gotcha is Over!");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    }

    updateTimeRemaining();
    const intervalId = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(intervalId);
  }, [endDate]);

  return (
    <div className="flex flex-1 p-8 items-center">
      <div className="space-y-2">
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
