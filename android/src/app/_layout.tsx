/**
 * _layout.tsx (root)
 *
 * The top of the app. Expo Router renders this around every screen.
 *
 * Responsibilities:
 * 1. Provide auth state to the whole app (<AuthProvider>).
 * 2. Keep the splash screen up until Firebase has restored the saved session,
 *    so users don't see a flash of the sign-in screen on launch.
 * 3. Decide which screens exist based on sign-in state, using
 *    <Stack.Protected>. When `guard` is false, those screens are unreachable,
 *    and Expo Router automatically redirects to the first allowed screen.
 *    This replaces the `redirect("/")` calls in the website's clientLoaders.
 *
 * Route map (file → screen):
 *   sign-in.tsx           Sign in with Google        (signed out only)
 *   (app)/_layout.tsx     Bottom tabs                (signed in only)
 *     (app)/index.tsx       Profile tab
 *     (app)/leaderboard.tsx Leaderboard tab
 *   last-words.tsx        "Any last words?" modal    (signed in only)
 *
 * The "(app)" folder name in parentheses is a route *group*: it organizes
 * files without adding "/app" to the URL.
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/lib/useAuth";
import { colors } from "@/lib/theme";

// Keep the native splash screen visible until we explicitly hide it below.
SplashScreen.preventAutoHideAsync();

/** Root component: wraps everything in the auth context. */
export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}

/**
 * The navigator. Lives in its own component because it needs `useAuth()`,
 * which only works *inside* <AuthProvider>.
 */
function RootNavigator() {
  const { user, initializing } = useAuth();

  // Hide the splash screen once we know whether someone is signed in.
  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  // Render nothing while initializing. The splash screen is covering us anyway.
  if (initializing) return null;

  const signedIn = !!user;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Signed-in screens. */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
        <Stack.Screen
          name="last-words"
          // Full-screen modal: no back swipe into the profile while it's open,
          // matching the website where this page replaces the whole view.
          options={{ presentation: "fullScreenModal", gestureEnabled: false }}
        />
      </Stack.Protected>

      {/* Signed-out screens. */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
