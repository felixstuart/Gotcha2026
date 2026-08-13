import { NavLink, Outlet } from "react-router";
import GotchaLogo from "../assets/gotcha-logo.png";

export default function Layout() {
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
          <NavLink className="flex items-center" to={"/app/profile"}>Profile</NavLink>
          <NavLink className="flex items-center" to={"/app/leaderboard"}>Leaderboard</NavLink>
        </div>
      </header>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
