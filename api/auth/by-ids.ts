import { adminDb } from "../_lib/firebaseAdmin.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

type Body = { ids?: string[] };

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody<Body>(req.body);
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 20) : [];
  if (ids.length === 0) {
    res.status(200).json({ profiles: [] });
    return;
  }

  const snapshots = await Promise.all(
    ids.map((id) => adminDb.collection("playerDirectory").doc(id).get())
  );

  const profiles = snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data());

  res.status(200).json({ profiles });
}
