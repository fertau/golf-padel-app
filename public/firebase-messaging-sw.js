/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/11.3.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.3.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBoQMH1mpY5GQqcW5wTmGFexOhm2uLxGaI",
  authDomain: "golf-padel-app.firebaseapp.com",
  projectId: "golf-padel-app",
  storageBucket: "golf-padel-app.firebasestorage.app",
  messagingSenderId: "318612260560",
  appId: "1:318612260560:web:5f6f59e2321475a3e380d5"
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
