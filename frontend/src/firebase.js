// Firebase Web SDK config + Google sign-in helper.
// IMPORTANT: replace REACT_APP_FIREBASE_API_KEY in /app/frontend/.env with the
// real Web API key from Firebase Console → Project Settings → Your Apps → Web app config.
// (Web API keys ALWAYS start with "AIzaSy". The "BCG8..." you have is a VAPID key, not this.)
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_SENDER_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

let _app, _auth;
function ensureInit() {
  if (!_app) {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
  }
  return _auth;
}

export async function googleSignInIdToken() {
  const auth = ensureInit();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return await result.user.getIdToken();
}

export async function googleSignOut() {
  if (_auth) await fbSignOut(_auth);
}
