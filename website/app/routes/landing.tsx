import type { Route } from "./+types/landing";
import { FuzzyText } from "../../components/GotchaHero";
import GoogleLogo from "../../assets/google-logo.png";
import { useNavigate } from "react-router";
import {
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../../firebase";
import { GoogleAuthProvider } from "firebase/auth";

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
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/app/profile");
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="flex h-svh min-h-[24rem] flex-col bg-slate-900">
      <FuzzyText
        fontSize="8rem"
        color="#ffff"
        baseIntensity={0.01}
        hoverIntensity={0.15}
        verticalCoverage={0.8}
        fillParent
        className="min-h-0 w-full flex-1"
      >
        GOTCHA
      </FuzzyText>

      <div className="flex shrink-0 flex-col items-center gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white bg-slate-900 w-full sm:flex-row">
        <h1 className="text-sm text-slate-400">
          GOTCHA • brought to you by Programming Club • Please Proceed with
          Google
        </h1>
        <button
          onClick={() => signInWithGoogle()}
          className="flex rounded-md bg-slate-600 hover:bg-slate-700 active:bg-slate-800 items-center justify-center min-h-12 w-full px-6 py-2 gap-2 sm:ml-auto sm:w-auto shrink-0 whitespace-nowrap"
        >
          <img src={GoogleLogo} alt="Google Logo" className="w-8 h-8" />
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
}
