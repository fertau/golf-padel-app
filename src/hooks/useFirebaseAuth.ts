import { useEffect } from "react";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuthStore } from "../stores/useAuthStore";
import { triggerHaptic } from "../lib/utils";
import { unregisterPushTokens } from "../lib/push";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const LOGIN_PENDING_KEY = "golf-padel-google-login-pending";

/**
 * Firebase auth lifecycle: redirect setup, auth state listener, login/logout.
 * Extracted from App.tsx to reduce monolith size.
 */
export function useFirebaseAuth() {
  const { firebaseUser, setFirebaseUser, setAuthLoading, setAuthError } = useAuthStore();

  // Firebase Auth Flow
  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }

    let cancelled = false;

    const setupRedirect = async () => {
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        const result = await getRedirectResult(firebaseAuth);
        if (result?.user && !cancelled) {
          setFirebaseUser(result.user);
          sessionStorage.removeItem(LOGIN_PENDING_KEY);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError((error as Error).message);
          sessionStorage.removeItem(LOGIN_PENDING_KEY);
        }
      }
    };

    setupRedirect();

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (cancelled) return;
      setFirebaseUser(user);
      setAuthLoading(false);
      if (user) {
        setAuthError(null);
        sessionStorage.removeItem(LOGIN_PENDING_KEY);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const loginGoogle = async () => {
    const firebaseAuth = auth;
    if (!firebaseAuth) return;

    try {
      triggerHaptic("medium");
      const result = await signInWithPopup(firebaseAuth, googleProvider).catch(() => null);
      if (result?.user) {
        setFirebaseUser(result.user);
        return;
      }
      sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
      await signInWithRedirect(firebaseAuth, googleProvider);
    } catch (error) {
      setAuthError((error as Error).message);
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    }
  };

  const logout = async () => {
    const firebaseAuth = auth;
    if (!firebaseAuth) return;

    await unregisterPushTokens();
    await signOut(firebaseAuth);
    triggerHaptic("medium");
  };

  return {
    firebaseUser,
    loginGoogle,
    logout,
    isLoginPending: sessionStorage.getItem(LOGIN_PENDING_KEY) === "1",
  };
}
