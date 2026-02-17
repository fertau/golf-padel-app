import { adminDb } from "../_lib/firebaseAdmin";
import { normalizeUsername } from "../_lib/authShared";
import type { VercelRequestLike, VercelResponseLike } from "../_lib/http";

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
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
