/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.3.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.3.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const isConfigured = Object.values(firebaseConfig).every((value) => typeof value === "string" && value.length > 0);

if (isConfigured) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Vibration patterns per event type
  const vibrationPatterns = {
    need_players: [100, 50, 100, 50, 200], // urgent: short-short-long
    match_cancelled: [200, 100, 200],       // alert
    default: [100, 50, 100]                 // standard
  };

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? "Padel App";
    const eventType = payload.data?.eventType ?? "default";
    const vibrate = vibrationPatterns[eventType] ?? vibrationPatterns.default;

    const options = {
      body: payload.notification?.body ?? "Nueva novedad en tus reservas",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      vibrate,
      data: {
        url: payload.data?.url ?? "/",
        eventType
      },
      tag: eventType + "-" + (payload.data?.reservationId ?? Date.now()),
    };

    self.registration.showNotification(title, options);
  });
}

// Deep link handling: tap notification → open match detail
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/";
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", url });
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(fullUrl);
    })
  );
});
