import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

console.log("CRITICAL DEBUG - Runtime API Key:", firebaseConfig.apiKey);
console.log("CRITICAL DEBUG - Full config:", JSON.stringify(firebaseConfig, null, 2));

if (!firebaseConfig.apiKey) {
  console.error(
    "[Firebase] VITE_FIREBASE_API_KEY is undefined. " +
    "Ensure frontend/.env exists and the dev server was restarted after adding it."
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;