// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { GoogleAuthProvider } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC35OSKmGGTL1l_T_lH_rjrhx6gUB1vkWY",
  authDomain: "felixs-gotcha-tes.firebaseapp.com",
  databaseURL: "https://felixs-gotcha-tes-default-rtdb.firebaseio.com",
  // Isolated emulator runs can select a demo project without changing release config.
  projectId: useEmulators
    ? import.meta.env.VITE_FIREBASE_PROJECT_ID || "felixs-gotcha-tes"
    : "felixs-gotcha-tes",
  storageBucket: "felixs-gotcha-tes.firebasestorage.app",
  messagingSenderId: "680586060563",
  appId: "1:680586060563:web:08b57c8124c29996c970e6",
  measurementId: "G-1S2HPGK9SK",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const functions = getFunctions(app, "us-central1");

if (useEmulators) {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export const googleProvider = GoogleAuthProvider;

/**
 * getProfile keeps the `admin` claim on your ID token in step with your roster role.
 * If the token disagrees with the role it returned, the server has just changed the claim,
 * so fetch a fresh token before calling any admin-only function.
 */
export async function refreshAdminClaim(profile: { role: string } | null) {
  const user = auth.currentUser;
  if (!user || !profile) return;
  const { claims } = await user.getIdTokenResult();
  if ((claims.admin === true) !== (profile.role === "admin")) {
    await user.getIdToken(true);
  }
}

// connectFirestoreEmulator(db, "localhost", 8080);
// connectAuthEmulator(auth, "http://localhost:9099");
