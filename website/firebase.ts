// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getRemoteConfig } from "firebase/remote-config";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { GoogleAuthProvider } from "firebase/auth/web-extension";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC35OSKmGGTL1l_T_lH_rjrhx6gUB1vkWY",
  authDomain: "felixs-gotcha-tes.firebaseapp.com",
  databaseURL: "https://felixs-gotcha-tes-default-rtdb.firebaseio.com",
  projectId: "felixs-gotcha-tes",
  storageBucket: "felixs-gotcha-tes.firebasestorage.app",
  messagingSenderId: "680586060563",
  appId: "1:680586060563:web:08b57c8124c29996c970e6",
  measurementId: "G-1S2HPGK9SK",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

export const remoteConfig = getRemoteConfig(app);
export const auth = getAuth(app);

export const functions = getFunctions(app, "us-central1");
connectFunctionsEmulator(functions, "localhost", 5001);

export const googleProvider = GoogleAuthProvider;

// connectFirestoreEmulator(db, "localhost", 8080);
// connectAuthEmulator(auth, "http://localhost:9099");
