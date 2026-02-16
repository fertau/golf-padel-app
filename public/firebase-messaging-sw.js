/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.3.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.3.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "Golf Padel";
  const options = {
    body: payload.notification?.body ?? "Nueva novedad en tus reservas",
    icon: "/favicon.svg"
  };

  self.registration.showNotification(title, options);
});
