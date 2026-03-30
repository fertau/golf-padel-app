import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

type PreferencesBody = {
  pushEnabled?: boolean;
  notifications?: Record<string, boolean>;
};

/**
 * GET  /api/push/preferences — fetch current preferences
 * POST /api/push/preferences — update preferences
 */
export default async function handler(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const uid = await requireAuthUid(req);
    const docRef = adminDb.collection("users").doc(uid).collection("preferences").doc("notifications");

    if (req.method === "GET") {
      const doc = await docRef.get();
      const data = doc.exists ? doc.data() : { pushEnabled: true };
      res.status(200).json(data);
      return;
    }

    // POST: merge update
    const body = parseBody<PreferencesBody>(req.body);
    const update: Record<string, unknown> = {};

    if (typeof body.pushEnabled === "boolean") {
      update.pushEnabled = body.pushEnabled;
    }

    if (body.notifications && typeof body.notifications === "object") {
      for (const [key, value] of Object.entries(body.notifications)) {
        if (typeof value === "boolean") {
          update[`notifications.${key}`] = value;
        }
      }
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "No hay preferencias para actualizar." });
      return;
    }

    await docRef.set(update, { merge: true });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "Error al actualizar preferencias." });
  }
}
