import { getToken } from "firebase/messaging";
import { getMessagingIfSupported } from "./firebase";

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

export const registerPushToken = async () => {
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
  }

  return token;
};
