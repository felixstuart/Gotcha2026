import { NavLink, Outlet, useMatches } from "react-router";
import GotchaLogo from "../assets/gotcha-logo.png";
import type { Profile } from "../../types";

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

export default function Layout() {
  const matches = useMatches();
  const adminProfile = matches
    .map((match) => (match.data as { adminProfile?: Profile } | undefined)?.adminProfile)
    .find((profile): profile is Profile => profile !== undefined);

  return (
    <div className="bg-slate-900 dark:bg-slate-900 text-white min-w-full min-h-screen">
      <header className="flex items-center p-2">
        <div className="flex items-center">
          <img
            src={GotchaLogo}
            alt="The Classic Gotcha Outstretched Hand"
            className="w-16 h-16"
          />
          <h1 className="text-2xl font-bold text-white flex items-center">
            Gotcha
          </h1>
        </div>
        <div className="flex ml-auto mr-4 space-x-8 *:font-bold text-center text-xl items-center *:hover:text-slate-300">
          <NavLink className="flex items-center" to={"app/admin/users"}>Manage Players</NavLink>
          <NavLink className="flex items-center" to={"app/admin/gameplay"}>Manage Gameplay</NavLink>
        </div>
      </header>
      {adminProfile && (
        <h1 className="p-4 text-2xl font-bold text-white">
          {getGreeting()}, {adminProfile.firstName}.
        </h1>
      )}
      <div>
        <Outlet />
      </div>
    </div>
  );
}
