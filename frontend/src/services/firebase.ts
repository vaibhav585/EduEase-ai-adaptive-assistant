// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAaDbPz6noJJmfEwyvXqFUK75bvhNUFCcI",
  authDomain: "ai-learning-app-3025f.firebaseapp.com",
  projectId: "ai-learning-app-3025f",
  storageBucket: "ai-learning-app-3025f.firebasestorage.app",
  messagingSenderId: "1008646528153",
  appId: "1:1008646528153:web:268dcdde279d0e5c43ac08",
  measurementId: "G-8LSBE8CFW0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
const analytics = getAnalytics(app);