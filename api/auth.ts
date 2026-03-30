import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { adminAuth, adminDb } from "./_lib/firebaseAdmin.js";
import { normalizeUsername, assertPinFormat } from "./_lib/authShared.js";
import { hashPin, verifyPin } from "./_lib/pinSecurity.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "./_lib/http.js";

// ── Types ────────────────────────────────────────────────────────────────────

type LoginBody = {
  playerId?: string;
  pin?: string;
};

type RegisterBody = {
  name?: string;
  pin?: string;
  avatar?: string;
};

type ByIdsBody = { ids?: string[] };

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleLogin(req: VercelRequestLike, res: VercelResponseLike) {
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

async function handleRegister(req: VercelRequestLike, res: VercelResponseLike) {
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

async function handleSearch(
  req: VercelRequestLike & { query?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.method === "POST") {
    const body = parseBody<ByIdsBody>(req.body);
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 20) : [];
    if (ids.length === 0) {
      res.status(200).json({ profiles: [] });
      return;
    }

    const snapshots = await Promise.all(ids.map((id) => adminDb.collection("playerDirectory").doc(id).get()));
    const profiles = snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.data());
    res.status(200).json({ profiles });
    return;
  }

  const rawName = req.query?.name;
  const name = typeof rawName === "string" ? rawName : "";
  const normalized = normalizeUsername(name);
  if (!normalized) {
    res.status(400).json({ error: "Falta nombre." });
    return;
  }

  const usernameDoc = await adminDb.collection("usernames").doc(normalized).get();
  if (!usernameDoc.exists) {
    res.status(404).json({ error: "No encontrado." });
    return;
  }

  const playerId = usernameDoc.get("playerId") as string;
  const directoryDoc = await adminDb.collection("playerDirectory").doc(playerId).get();
  if (!directoryDoc.exists) {
    res.status(404).json({ error: "No encontrado." });
    return;
  }

  res.status(200).json({
    profile: directoryDoc.data()
  });
}

// ── Router ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequestLike & { query?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  const action = (Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action) as string | undefined;

  switch (action) {
    case "login":
      return handleLogin(req, res);
    case "register":
      return handleRegister(req, res);
    case "search":
      return handleSearch(req, res);
    default:
      res.status(400).json({ error: "Unknown action. Use ?action=login|register|search" });
  }
}
