import { LeaderboardCard } from "components/LeaderboardCard";
import type { Route } from "../+types/root";
import { remoteConfig } from "../../firebase";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import React from "react";

export async function clientLoader() {
  await fetchAndActivate(remoteConfig); // fetch latest values
  const endDateValue = getValue(remoteConfig, "endDate");
  const endDate = endDateValue.asString();

  console.log("endDate:", endDate);

  return { endDate };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  // @ts-expect-error
  const { endDate } = loaderData;
  const [timeRemaining, setTimeRemaining] = React.useState<string>("");

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
        <LeaderboardCard name="Felix Stuart" tags={100} position={1} />
        <LeaderboardCard name="Felix Stuart" tags={99} position={2} />
        <LeaderboardCard name="Felix Stuart" tags={98} position={3} />
      </div>

      <div className="flex flex-1 items-center justify-center p-4 rounded-xl">
        <h1 className="text-red-500 text-4xl text-center font-bold">{timeRemaining}</h1>
      </div>
    </div>
  );
}
