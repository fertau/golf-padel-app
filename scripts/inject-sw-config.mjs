/**
 * Build-time: inject Firebase config into firebase-messaging-sw.js
 *
 * Reads VITE_FIREBASE_* env vars and replaces empty strings in the
 * built SW file at dist/firebase-messaging-sw.js.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const SW_PATH = resolve("dist", "firebase-messaging-sw.js");

if (!existsSync(SW_PATH)) {
  console.log("[inject-sw-config] No SW found at dist/ — skipping.");
  process.exit(0);
}

const envMap = {
  apiKey: process.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.VITE_FIREBASE_APP_ID ?? "",
};

const missing = Object.entries(envMap).filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  console.warn(`[inject-sw-config] Missing env vars: ${missing.join(", ")}`);
}

let content = readFileSync(SW_PATH, "utf-8");

for (const [key, value] of Object.entries(envMap)) {
  const pattern = new RegExp(`(${key}:\\s*)""`);
  content = content.replace(pattern, `$1"${value}"`);
}

writeFileSync(SW_PATH, content, "utf-8");

const configured = Object.values(envMap).filter(Boolean).length;
console.log(`[inject-sw-config] ${configured}/${Object.keys(envMap).length} values injected.`);
