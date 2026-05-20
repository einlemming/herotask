// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, getRedirectResult, onAuthStateChanged } from "firebase/auth"
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB4aVlaWwYBcX5XPLd5D9PkdwpgO_34m-g",
  authDomain: "hero-tasks-896f7.firebaseapp.com",
  projectId: "hero-tasks-896f7",
  storageBucket: "hero-tasks-896f7.firebasestorage.app",
  messagingSenderId: "930753977229",
  appId: "1:930753977229:web:87a5f1dc2dea7537cebbc4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const provider = new GoogleAuthProvider()
const SIGN_IN_FLAG = "hero-tasks-google-sign-in"
// Auth
export const auth = getAuth(app)

export const isSignInInProgress = () => sessionStorage.getItem(SIGN_IN_FLAG) === "1"

export const clearSignInInProgress = () => {
  sessionStorage.removeItem(SIGN_IN_FLAG)
}

export const resolveRedirectSignIn = async () => {
  try {
    const result = await getRedirectResult(auth)  // return value nutzen!
    return result
  } catch (e) {
    clearSignInInProgress()
    throw e
  }
}

export const signIn = async () => {
  try {
    sessionStorage.setItem(SIGN_IN_FLAG, "1")
    provider.setCustomParameters({
      prompt: "select_account"
    })
    await signInWithRedirect(auth, provider)
  } catch (e) {
    clearSignInInProgress()
    console.error("Google Auth failed", e)
  }
}

// Helper: wartet bis User da ist
export const waitForUser = (): Promise<string> => {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user.uid)
        unsub()
      }
    })
  })
}

import { getFirestore } from "firebase/firestore"
export const db = getFirestore(app)
