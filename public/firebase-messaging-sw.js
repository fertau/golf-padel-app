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

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? "Padel App";
    const options = {
      body: payload.notification?.body ?? "Nueva novedad en tus reservas",
      icon: "/favicon.svg"
    };

    self.registration.showNotification(title, options);
  });
}
