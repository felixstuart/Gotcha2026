/**
 * useAuth.tsx
 *
 * Tracks who is signed in and shares it with every screen.
 *
 * The website re-checks auth inside every route's `clientLoader`. In the app we
 * subscribe once, in `<AuthProvider>` at the root layout, and screens read the
 * result with `useAuth()`. One subscription means one source of truth, and the
 * "wrong account" error set during sign-in is visible on the sign-in screen.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "@react-native-firebase/auth";
import type { User } from "@react-native-firebase/auth";
import { auth, signOut } from "./firebase";
import { clearCache, setCacheUser } from "./cache";
import { copy } from "./copy";

/** Only Milton accounts can play. The server enforces this too. */
const ALLOWED_DOMAIN = "@milton.edu";

type AuthState = {
  /** The signed-in Firebase user, or `null` if signed out. */
  user: User | null;
  /**
   * True until Firebase has restored any saved session. Don't redirect to
   * sign-in while this is true, or signed-in users would flash the sign-in
   * screen on every launch.
   */
  initializing: boolean;
  /** Set if the last sign-in attempt used a non-Milton account. */
  error: string | null;
};

const AuthContext = createContext<AuthState>({
  user: null,
  initializing: true,
  error: null,
});

/** Wrap the app in this (done in `src/app/_layout.tsx`). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    initializing: true,
    error: null,
  });

  useEffect(() => {
    // Fires once on startup (with the restored session or null), then again on
    // every sign in / sign out. It returns its own unsubscribe function, which
    // React calls on unmount.
    return onAuthStateChanged(auth, async (next) => {
      if (next && !next.email?.endsWith(ALLOWED_DOMAIN)) {
        // Wrong Google account: explain why, then sign them out. signOut
        // re-triggers this listener with `null`, which finishes the update.
        setState((s) => ({ ...s, error: copy.landing.schoolAccountOnly }));
        await signOut();
        return;
      }

      // Cached data is saved per user. Signed out: forget all of it.
      setCacheUser(next?.uid ?? null);
      if (!next) await clearCache();

      setState((s) => ({
        user: next,
        initializing: false,
        // Keep the wrong-account message while signed out so the sign-in
        // screen can show it, and clear it once a valid account signs in.
        error: next ? null : s.error,
      }));
    });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Read the current auth state from any screen or component. */
export function useAuth() {
  return useContext(AuthContext);
}
