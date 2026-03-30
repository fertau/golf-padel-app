import { getToken } from "firebase/messaging";
import { getMessagingIfSupported } from "./firebase";
import { auth } from "./firebase";

const TOKEN_KEY = "golf-padel-push-token";

export const requestPushPermission = async () => {
  if (!("Notification" in window)) {
    throw new Error("Este navegador no soporta notificaciones");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones denegado");
  }

  return permission;
};

export const registerPushToken = async (): Promise<string | undefined> => {
  await requestPushPermission();

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return undefined;
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    return undefined;
  }

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: await navigator.serviceWorker.ready
  });

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    // Send token to server
    await sendTokenToServer(token);
  }

  return token;
};

/**
 * Send FCM token to server for push delivery.
 * Silently fails — push registration should never block UX.
 */
async function sendTokenToServer(token: string) {
  try {
    const firebaseAuth = auth;
    if (!firebaseAuth?.currentUser) return;

    const idToken = await firebaseAuth.currentUser.getIdToken();
    await fetch("/api/push/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        token,
        platform: "web",
        userAgent: navigator.userAgent,
      }),
    });
  } catch {
    // Silent fail — token registration is best-effort
    console.warn("[push] Failed to register token with server");
  }
}

/**
 * Delete all push tokens on logout.
 */
export async function unregisterPushTokens() {
  try {
    const firebaseAuth = auth;
    if (!firebaseAuth?.currentUser) return;

    const idToken = await firebaseAuth.currentUser.getIdToken();
    await fetch("/api/push/register", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch {
    console.warn("[push] Failed to unregister tokens");
  }
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Check if push notifications are supported and permission is granted.
 */
export function isPushSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator;
}

export function isPushGranted(): boolean {
  return isPushSupported() && Notification.permission === "granted";
}

/**
 * Set PWA badge count (progressive enhancement).
 */
export async function setBadgeCount(count: number) {
  try {
    if ("setAppBadge" in navigator) {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    }
  } catch {
    // Badge API not supported — silent fail
  }
}
