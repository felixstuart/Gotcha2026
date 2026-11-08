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

/**
 * TODO(setup): the *web* OAuth client ID of Firebase project `felixs-gotcha-tes`.
 * Google Sign-In needs it so the ID token it returns can be exchanged for a
 * Firebase credential. Find it in the Firebase console under Authentication >
 * Sign-in method > Google > Web SDK configuration ("Web client ID", it ends in
 * `.apps.googleusercontent.com`). It is not in website/firebase.ts.
 */
const WEB_CLIENT_ID = "REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com";

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  // Only offer @milton.edu accounts in the picker. useAuth still rejects others.
  hostedDomain: "milton.edu",
});

/** The Firebase Auth instance. Used for sign-in state everywhere in the app. */
export const auth = getAuth();

/**
 * The Cloud Functions instance. Every bit of game data goes through callables
 * in `functions/src`, never directly to Firestore, so this is the app's only
 * data connection. The region comes from the shared contract.
 */
export const functions = getFunctions(getApp(), REGION);

// In development builds, talk to the local emulators instead of production
// (same as the website does with `import.meta.env.DEV`). The Android emulator
// reaches the host machine through the alias 10.0.2.2, not "localhost". The iOS
// simulator shares the host's network. A physical phone needs your computer's LAN IP.
if (__DEV__) {
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
  if (!__DEV__) throw new Error("Emulator sign-in is only for development builds");
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
