import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Golf Padel",
        short_name: "GolfPadel",
        description: "Reservas e inscripciones de padel para grupos de WhatsApp",
        theme_color: "#0f3d2f",
        background_color: "#f5f2e9",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml"
          }
        ]
      }
    })
  ]
});
