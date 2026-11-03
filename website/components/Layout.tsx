import { NavLink, Outlet } from "react-router";
import GotchaLogo from "../assets/gotcha-logo.png";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { signOut, getAuth } from "firebase/auth";

export default function Layout() {
    console.log("layout renders");
    const location = useLocation();
    const pathname = location.pathname;
    useEffect(() => {
        console.log("hi");
        console.log(pathname);
    }, [pathname]);

    async function signUserOut() {
        console.log("signing out");
        const auth = await getAuth();
        await signOut(auth);
        console.log("should be signed out");
        window.location.reload();
    }

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

            {
                pathname === "/app/profile" ?
                    <NavLink className="flex items-center underline" to={"/app/profile"}>Profile</NavLink> :
                    <NavLink className="flex items-center" to={"/app/profile"}>Profile</NavLink>
            }
            {    
                pathname === "/app/leaderboard" ?
                    <NavLink className="flex items-center underline" to={"/app/leaderboard"}>Leaderboard</NavLink> :
                    <NavLink className="flex items-center" to={"/app/leaderboard"}>Leaderboard</NavLink>
            }

            <button className="bg-slate-600 px-3 py-1 rounded-sm" onClick={() => signUserOut()}>Sign out</button>
            </div>
        </header>
        <div>
            <Outlet />
        </div>
    </div>
  );
}
