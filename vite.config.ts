import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "icon-padel.svg",
        "apple-touch-icon.svg",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png"
      ],
      manifest: {
        id: "/",
        name: "Padel App",
        short_name: "PadelApp",
        description: "Reservas e inscripciones de padel para grupos de WhatsApp",
        theme_color: "#010614",
        background_color: "#010614",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "apple-touch-icon.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ]
});
