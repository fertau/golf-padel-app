import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { adminAuth, adminDb } from "../_lib/firebaseAdmin";
import { normalizeUsername, assertPinFormat } from "../_lib/authShared";
import { hashPin } from "../_lib/pinSecurity";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http";

type RegisterBody = {
  name?: string;
  pin?: string;
  avatar?: string;
};

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody<RegisterBody>(req.body);
  const rawName = body.name?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";
  const avatar = body.avatar?.trim() || "🎾";
  const usernameNormalized = normalizeUsername(rawName);

  if (rawName.length < 2) {
    res.status(400).json({ error: "El nombre debe tener al menos 2 caracteres." });
    return;
  }
  if (!assertPinFormat(pin)) {
    res.status(400).json({ error: "El PIN debe ser de 4 dígitos." });
    return;
  }

  const usernameRef = adminDb.collection("usernames").doc(usernameNormalized);
  const existingUsername = await usernameRef.get();
  if (existingUsername.exists) {
    const existingPlayerId = existingUsername.get("playerId") as string;
    const existingDirectory = await adminDb.collection("playerDirectory").doc(existingPlayerId).get();
    if (!existingDirectory.exists) {
      res.status(409).json({ error: "Ese nombre ya está en uso." });
      return;
    }
    res.status(409).json({
      message: "Ese nombre ya existe.",
      profile: existingDirectory.data()
    });
    return;
  }

  const playerId = randomUUID();
  const ownerUid = `player_${playerId}`;
  const pinPayload = hashPin(pin);
  const now = Timestamp.now();

  try {
    await adminDb.runTransaction(async (tx) => {
      const taken = await tx.get(usernameRef);
      if (taken.exists) {
        throw new Error("USERNAME_TAKEN");
      }

      tx.create(adminDb.collection("players").doc(playerId), {
        id: playerId,
        ownerId: ownerUid,
        name: rawName,
        usernameNormalized,
        avatar,
        createdAt: now,
        updatedAt: now,
        isPinned: true,
        visibility: "public",
        isAdmin: false,
        stats: {},
        derivedStats: {},
        friends: [],
        friendRequests: [],
        sentRequests: [],
        ...pinPayload
      });

      tx.create(usernameRef, {
        playerId,
        createdAt: now
      });

      tx.create(adminDb.collection("playerDirectory").doc(playerId), {
        id: playerId,
        name: rawName,
        usernameNormalized,
        avatar,
        isAdmin: false
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "USERNAME_TAKEN") {
      const existing = await usernameRef.get();
      const existingPlayerId = existing.get("playerId") as string;
      const existingDirectory = await adminDb.collection("playerDirectory").doc(existingPlayerId).get();
      res.status(409).json({
        message: "Ese nombre ya existe.",
        profile: existingDirectory.data()
      });
      return;
    }
    throw error;
  }

  const customToken = await adminAuth.createCustomToken(ownerUid, { playerId });
  res.status(200).json({
    customToken,
    profile: {
      id: playerId,
      name: rawName,
      usernameNormalized,
      avatar,
      isAdmin: false
    }
  });
}
