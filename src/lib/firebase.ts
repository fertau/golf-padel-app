import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
);

const app = firebaseEnabled ? initializeApp(firebaseConfig) : undefined;

export const auth = app ? getAuth(app) : undefined;
export const db = app ? getFirestore(app) : undefined;
export const storage = app ? getStorage(app) : undefined;

export const getMessagingIfSupported = async () => {
  if (!app) {
    return undefined;
  }

  const supported = await isSupported();
  if (!supported) {
    return undefined;
  }

  return getMessaging(app);
};
