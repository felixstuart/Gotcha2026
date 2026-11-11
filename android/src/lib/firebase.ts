/**
 * firebase.ts
 *
 * One place that sets up every Firebase service the app uses. This is the
 * mobile equivalent of `website/firebase.ts`, but it uses React Native Firebase
 * (the native Android/iOS SDKs) instead of the web JS SDK.
 *
 * Native config (API keys, project ID, etc.) is NOT in this file. It comes from
 * `google-services.json` (Android) and `GoogleService-Info.plist` (iOS), which
 * you download from the Firebase console into the project root (both gitignored).
 */
import { Platform } from "react-native";
import { getApp } from "@react-native-firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
} from "@react-native-firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "@react-native-firebase/functions";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { REGION } from "@/generated/callables";

// Public web OAuth client ID from this project's native Firebase SDK configuration.
const WEB_CLIENT_ID = "680586060563-cgvv1jqtckh3s8e2e2q7cbvuj8nnptt8.apps.googleusercontent.com";

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  // Only offer @milton.edu accounts in the picker. useAuth still rejects others.
  hostedDomain: "milton.edu",
});

/** The Firebase Auth instance. Used for sign-in state everywhere in the app. */
export const auth = getAuth();

export const useEmulators = __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";

/**
 * The Cloud Functions instance. Every bit of game data goes through callables
 * in `functions/src`, never directly to Firestore, so this is the app's only
 * data connection. The region comes from the shared contract.
 */
export const functions = getFunctions(getApp(), REGION);

// Opt in to backend emulators; local builds otherwise use the configured Firebase project.
// (same as the website does with `import.meta.env.DEV`). The Android emulator
// reaches the host machine through the alias 10.0.2.2, not "localhost". The iOS
// simulator shares the host's network. A physical phone needs your computer's LAN IP.
if (useEmulators) {
  const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  connectAuthEmulator(auth, `http://${host}:9099`);
  connectFunctionsEmulator(functions, host, 5001);
}

/**
 * Shows the native Google account picker, then signs into Firebase with the
 * chosen account. Returns `null` if the user cancelled the picker.
 *
 * The `@milton.edu` check happens in `useAuth` (and again on the server), not
 * here, so a wrong-domain account is signed out right after.
 */
export async function signInWithGoogle() {
  // Android only: makes sure Google Play Services is installed and up to date.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // closed the picker

  const credential = GoogleAuthProvider.credential(response.data.idToken);
  return signInWithCredential(auth, credential);
}

/**
 * Development only: signs in to the Auth emulator as any roster email, like the
 * emulator's Google popup on the website. The emulator accepts an unsigned Google
 * ID token, so no real Google account is involved.
 */
export async function signInToEmulator(email: string) {
  if (!useEmulators) throw new Error("Enable backend emulators before emulator sign-in");
  const address = email.trim().toLowerCase();
  const base64url = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({
    sub: `emulator-${address}`,
    email: address,
    email_verified: true,
    name: address.split("@")[0],
  })}.`;
  return signInWithCredential(auth, GoogleAuthProvider.credential(token));
}

/**
 * Signs out of both Firebase and Google. Signing out of Google too means the
 * account picker shows up again next time, so players can switch accounts.
 * useAuth clears the cache when the sign-out lands.
 */
export async function signOut() {
  await GoogleSignin.signOut().catch(() => {}); // fine if Google wasn't signed in
  await firebaseSignOut(auth);
}
