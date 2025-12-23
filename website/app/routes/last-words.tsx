"use client";
import React from "react";
import { useNavigate } from "react-router";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../firebase";
import LetterGlitch from "../../components/LetterGlitch";

export default function LastWords() {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const lastWords = inputRef.current?.value?.trim() ?? "";
    if (!lastWords) {
      setError("Please enter your last words.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      setError("You must be signed in to submit last words.");
      return;
    }

    setLoading(true);
    try {
      const setLastWordsFn = httpsCallable(functions, "setLastWords");
      const res = await setLastWordsFn({ lastWords, email: user.email });

      // Check for custom status in response if your function returns it
      if (
        res?.data &&
        typeof res.data === "object" &&
        (res.data as any).status !== undefined
      ) {
        if ((res.data as any).status !== 200) {
          setError("Failed to submit. Please try again.");
          setLoading(false);
          return;
        }
      }

      // Success
      navigate("/app/leaderboard");
    } catch (err: any) {
      console.error("Error setting last words:", err);
      const msg = err?.message || "";
      if (msg.includes("Last words already set")) {
        setError("You have already submitted your last words.");
      } else if (msg.includes("unauthenticated")) {
        setError("Please sign in again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      <LetterGlitch
        glitchSpeed={100}
        centerVignette={true}
        outerVignette={false}
        smooth={true}
        characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789"
      >
        <div className="w-full h-full flex flex-col items-center justify-center p-4 z-50 relative">
          <div className="max-w-md w-full p-8 flex flex-col items-center space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-white text-4xl font-bold tracking-tighter">
                Thanks for playing.
              </h1>
              <p className="text-gray-400 text-sm">Any last words?</p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="w-full flex flex-col space-y-6"
            >
              <div className="relative group">
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  disabled={loading}
                  maxLength={60}
                  className="w-full bg-black/50 border-2 rounded-lg border-gray-700 py-3 text-center text-white placeholder-gray-600 focus:outline-none focus:border-slate-500 transition-colors disabled:opacity-50"
                  placeholder="I'll be back..."
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-sm text-center animate-pulse">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-white text-black font-bold hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.1s]" />
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.2s]" />
                  </span>
                ) : (
                  "Submit"
                )}
              </button>
            </form>
          </div>
        </div>
      </LetterGlitch>
    </div>
  );
}
