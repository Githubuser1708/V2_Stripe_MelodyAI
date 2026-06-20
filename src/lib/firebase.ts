import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDLZ8mvRv-pkcnOGuC1B2GS5bjH5mC99bo",
  authDomain: "gen-lang-client-0814101024.firebaseapp.com",
  projectId: "gen-lang-client-0814101024",
  storageBucket: "gen-lang-client-0814101024.firebasestorage.app",
  messagingSenderId: "639585907244",
  appId: "1:639585907244:web:86baa981fcac3003c81789"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore specifying database ID
export const db = initializeFirestore(app, {}, "ai-studio-2156333b-9a31-495a-af3a-dd277b24d1a4");
