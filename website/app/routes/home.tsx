import type { Route } from "./+types/home";
import { FuzzyText } from "components/GotchaHero";
import GoogleLogo from "assets/google-logo.png";
import { useNavigate } from "react-router";
import {
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "firebase";
import { GoogleAuthProvider } from "firebase/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  const navigate = useNavigate();

  const signInWithGoogle = async () => {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log("Persistence set to local");
      })
      .catch((err) => {
        console.error("Error setting persistence:", err);
      });
    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/app/profile");
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="relative bg-slate-900">
      <FuzzyText
        fontSize="8rem"
        color="#ffff"
        baseIntensity={0.01}
        hoverIntensity={2}
        verticalCoverage={0.8}
      >
        GOTCHA
      </FuzzyText>

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 px-4 py-4 text-white bg-slate-900 w-full">
        <h1 className="text-sm text-slate-400">
          GOTCHA • brought to you by Programming Club • Please Proceed with
          Google
        </h1>
        <button
          onClick={() => signInWithGoogle()}
          className="flex rounded-md bg-slate-600 hover:bg-slate-700 active:bg-slate-800 items-center justify-center px-6 py-2 gap-2 ml-auto"
        >
          <img src={GoogleLogo} alt="Google Logo" className="w-8 h-8" />
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
}
