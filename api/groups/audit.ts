import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import type { VercelRequestLike, VercelResponseLike } from "../_lib/http.js";

const parseQueryValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function handler(
  req: VercelRequestLike & {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  },
  res: VercelResponseLike
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authUid = await requireAuthUid(req);
    const groupId = parseQueryValue(req.query?.groupId)?.trim();
    const rawLimit = Number.parseInt(parseQueryValue(req.query?.limit) ?? "30", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

    if (!groupId) {
      res.status(400).json({ error: "Falta groupId." });
      return;
    }

    const groupSnapshot = await adminDb.collection("groups").doc(groupId).get();
    if (!groupSnapshot.exists) {
      res.status(404).json({ error: "Grupo no encontrado." });
      return;
    }

    const group = groupSnapshot.data() as {
      ownerAuthUid?: string;
      adminAuthUids?: string[];
      memberAuthUids?: string[];
      isDeleted?: boolean;
    };
    if (group.isDeleted === true) {
      res.status(404).json({ error: "Grupo no encontrado." });
      return;
    }

    const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
    const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
    const allowed =
      group.ownerAuthUid === authUid || adminAuthUids.includes(authUid) || memberAuthUids.includes(authUid);
    if (!allowed) {
      res.status(403).json({ error: "No tenés permisos para ver la actividad de este grupo." });
      return;
    }

    const snapshot = await adminDb.collection("groupAuditEvents").where("groupId", "==", groupId).limit(200).get();

    const events = snapshot.docs
      .map((snapshotDoc) => ({ id: snapshotDoc.id, ...(snapshotDoc.data() ?? {}) }))
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
      .slice(0, limit);
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudo cargar la actividad del grupo." });
  }
}
