import { useRef, useState } from "react";
import { FuzzyText } from "../../components/GotchaHero";
import GoogleLogo from "../../assets/google-logo.png";
import { useNavigate } from "react-router";
import {
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../../firebase";
import { GoogleAuthProvider } from "firebase/auth";

export default function Home() {
  const navigate = useNavigate();

  const pendingSignIn = useRef(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState("");

  const signInWithGoogle = async () => {
    if (pendingSignIn.current) return;
    pendingSignIn.current = true;
    setSigningIn(true);
    setSignInError("");
    try {
      // getAuth already chooses supported persistence. Keep the popup on this click,
      // without racing an additional persistence change or another sign-in attempt.
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/app/profile");
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user") {
        setSignInError(code === "auth/popup-blocked"
          ? "Allow popups for this site, then try signing in again."
          : "Google sign-in could not finish. Close the sign-in window and try again from this button.");
      }
    } finally {
      pendingSignIn.current = false;
      setSigningIn(false);
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
          onClick={signInWithGoogle}
          disabled={signingIn}
          aria-busy={signingIn}
          className="flex rounded-md bg-slate-600 hover:bg-slate-700 active:bg-slate-800 items-center justify-center min-h-12 w-full px-6 py-2 gap-2 sm:ml-auto sm:w-auto shrink-0 whitespace-nowrap"
        >
          <img src={GoogleLogo} alt="Google Logo" className="w-8 h-8" />
          <span>{signingIn ? "Signing in…" : "Sign in with Google"}</span>
        </button>
      </div>
      {signInError && <p role="alert" className="px-4 pb-4 text-center text-sm text-red-300">{signInError}</p>}
    </div>
  );
}
