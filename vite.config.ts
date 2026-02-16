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
        name: "Golf Padel App",
        short_name: "GolfPadel",
        description: "Reservas e inscripciones de padel para grupos de WhatsApp",
        theme_color: "#005BB7",
        background_color: "#005BB7",
        display: "standalone",
        start_url: "/",
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
          }
        ]
      }
    })
  ]
});
