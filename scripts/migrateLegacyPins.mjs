import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pbkdf2Sync, randomBytes } from "crypto";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
}

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();

const hashPin = (pin) => {
  const salt = randomBytes(16);
  const iterations = 210000;
  const hash = pbkdf2Sync(pin, salt, iterations, 32, "sha256");
  return {
    pinHash: hash.toString("base64"),
    pinSalt: salt.toString("base64"),
    pinIterations: iterations,
    pinAlgorithm: "PBKDF2-SHA256"
  };
};

const run = async () => {
  const snapshot = await db.collection("players").get();
  let migrated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (typeof data.pin === "string" && !data.pinHash) {
      const payload = hashPin(data.pin);
      await doc.ref.update({
        ...payload,
        pin: null,
        updatedAt: new Date()
      });
      migrated += 1;
      console.log(`[migrateLegacyPins] migrated ${doc.id}`);
    }
  }

  console.log(`[migrateLegacyPins] done. migrated=${migrated}`);
};

run().catch((error) => {
  console.error("[migrateLegacyPins] failed", error);
  process.exit(1);
});
