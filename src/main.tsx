import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const toast = document.createElement("div");
    toast.className = "sw-update-toast";
    toast.innerHTML = `
      <span>Nueva versión disponible</span>
      <button id="sw-update-btn">Actualizar</button>
      <button id="sw-dismiss-btn" aria-label="Cerrar">✕</button>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));

    document.getElementById("sw-update-btn")!.onclick = () => {
      updateSW(true);
    };
    document.getElementById("sw-dismiss-btn")!.onclick = () => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    };
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
