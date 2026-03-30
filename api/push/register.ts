import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

type RegisterBody = {
  token?: string;
  platform?: string;
  userAgent?: string;
};

export default async function handler(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method === "DELETE") {
    // Unregister all tokens for user (logout cleanup)
    try {
      const uid = await requireAuthUid(req);
      await adminDb.collection("pushTokens").doc(uid).delete();
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || "Error al eliminar tokens." });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const uid = await requireAuthUid(req);
    const body = parseBody<RegisterBody>(req.body);
    const token = body.token?.trim();

    if (!token) {
      res.status(400).json({ error: "Falta token." });
      return;
    }

    const now = new Date().toISOString();
    const platform = body.platform ?? "web";
    const userAgent = body.userAgent ?? "";

    const docRef = adminDb.collection("pushTokens").doc(uid);
    const doc = await docRef.get();
    const existing = doc.exists ? (doc.data()?.tokens ?? []) : [];

    // Upsert: update if same token exists, otherwise append
    const idx = existing.findIndex((t: { token: string }) => t.token === token);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], platform, userAgent, updatedAt: now };
    } else {
      existing.push({ token, platform, userAgent, createdAt: now, updatedAt: now });
    }

    await docRef.set({ tokens: existing });

    res.status(200).json({ ok: true, tokenCount: existing.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "Error al registrar token." });
  }
}
