import { adminAuth, adminDb } from "../_lib/firebaseAdmin";
import { assertPinFormat } from "../_lib/authShared";
import { hashPin, verifyPin } from "../_lib/pinSecurity";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http";

type LoginBody = {
  playerId?: string;
  pin?: string;
};

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody<LoginBody>(req.body);
  const playerId = body.playerId?.trim();
  const pin = body.pin?.trim() ?? "";

  if (!playerId) {
    res.status(400).json({ error: "Falta playerId." });
    return;
  }
  if (!assertPinFormat(pin)) {
    res.status(400).json({ error: "PIN inválido." });
    return;
  }

  const playerRef = adminDb.collection("players").doc(playerId);
  const playerSnapshot = await playerRef.get();
  if (!playerSnapshot.exists) {
    res.status(404).json({ error: "Cuenta no encontrada." });
    return;
  }

  const player = playerSnapshot.data() as {
    ownerId: string;
    name: string;
    avatar: string;
    usernameNormalized: string;
    isAdmin?: boolean;
    pinHash?: string;
    pinSalt?: string;
    pinIterations?: number;
    pin?: string;
  };

  let validPin = false;
  if (player.pinHash && player.pinSalt && player.pinIterations) {
    validPin = verifyPin(pin, {
      pinHash: player.pinHash,
      pinSalt: player.pinSalt,
      pinIterations: player.pinIterations
    });
  } else if (typeof player.pin === "string") {
    validPin = player.pin === pin;
    if (validPin) {
      const migrated = hashPin(pin);
      await playerRef.update({
        ...migrated,
        pin: null
      });
      console.log(`[PIN_MIGRATION] Migrated legacy PIN for player ${playerId}`);
    }
  }

  if (!validPin) {
    res.status(401).json({ error: "PIN incorrecto." });
    return;
  }

  const customToken = await adminAuth.createCustomToken(player.ownerId, { playerId });
  res.status(200).json({
    customToken,
    profile: {
      id: playerId,
      name: player.name,
      avatar: player.avatar,
      usernameNormalized: player.usernameNormalized,
      isAdmin: Boolean(player.isAdmin)
    }
  });
}
