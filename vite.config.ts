import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-padel.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "Golf Padel App",
        short_name: "GolfPadel",
        description: "Reservas e inscripciones de padel para grupos de WhatsApp",
        theme_color: "#0a2b85",
        background_color: "#04113d",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icon-padel.svg",
            sizes: "any",
            type: "image/svg+xml"
          },
          {
            src: "icon-padel.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable any"
          }
        ]
      }
    })
  ]
});
