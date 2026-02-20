import { adminDb } from "../_lib/firebaseAdmin.js";
import { normalizeUsername } from "../_lib/authShared.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

type ByIdsBody = { ids?: string[] };

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
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
