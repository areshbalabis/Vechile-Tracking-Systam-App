import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDatabase , ref, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCPZsGUSajZ35ak_YhmjbE67AEjhZ4cJLg",
  authDomain: "mydrivers-32f27.firebaseapp.com",
  databaseURL: "https://mydrivers-32f27-default-rtdb.firebaseio.com",
  projectId: "mydrivers-32f27",
  storageBucket: "mydrivers-32f27.firebasestorage.app",
  messagingSenderId: "983933924835",
  appId: "1:983933924835:web:a0c5788ae6d3c1423c1cd6",
};

const app = initializeApp(firebaseConfig);

// ✅ Use AsyncStorage persistence so login session is saved
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
const realtimeDb = getDatabase(app);

export { realtimeDb, ref, onValue };


