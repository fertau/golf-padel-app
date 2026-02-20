import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

type InviteChannel = "whatsapp" | "email" | "link";
type InviteTargetType = "group" | "reservation";

type CreateInviteBody = {
  targetType?: InviteTargetType;
  groupId?: string;
  reservationId?: string;
  baseUrl?: string;
  channel?: InviteChannel;
};

const nowIso = () => new Date().toISOString();
const expiresAtIso = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const normalizeBaseUrl = (raw?: string) => {
  const fallback = "https://golf-padel-app.vercel.app";
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, "");
};

const normalizeChannel = (value?: string): InviteChannel => {
  if (value === "whatsapp" || value === "email" || value === "link") {
    return value;
  }
  return "link";
};

export default async function handler(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actorAuthUid = await requireAuthUid(req);
    const body = parseBody<CreateInviteBody>(req.body);
    const targetType = body.targetType;
    const baseUrl = normalizeBaseUrl(body.baseUrl);
    const channel = normalizeChannel(body.channel);
    const token = crypto.randomUUID();

    if (targetType === "group") {
      const groupId = body.groupId?.trim();
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
        isDeleted?: boolean;
      };
      if (group.isDeleted === true) {
        res.status(404).json({ error: "Grupo no disponible." });
        return;
      }

      const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
      const actorIsAdmin = group.ownerAuthUid === actorAuthUid || adminAuthUids.includes(actorAuthUid);
      if (!actorIsAdmin) {
        res.status(403).json({ error: "Solo admins pueden invitar al grupo." });
        return;
      }

      await adminDb.collection("groupInvites").doc(token).set({
        token,
        targetType: "group",
        groupId,
        createdByAuthUid: actorAuthUid,
        createdAt: nowIso(),
        expiresAt: expiresAtIso(),
        status: "active",
        channel
      });

      res.status(200).json({ inviteLink: `${baseUrl}/join/${token}` });
      return;
    }

    if (targetType === "reservation") {
      const reservationId = body.reservationId?.trim();
      if (!reservationId) {
        res.status(400).json({ error: "Falta reservationId." });
        return;
      }

      const reservationSnapshot = await adminDb.collection("reservations").doc(reservationId).get();
      if (!reservationSnapshot.exists) {
        res.status(404).json({ error: "Reserva no encontrada." });
        return;
      }

      const reservation = reservationSnapshot.data() as {
        id?: string;
        groupId?: string;
        createdByAuthUid?: string;
      };
      if (!reservation.createdByAuthUid || reservation.createdByAuthUid !== actorAuthUid) {
        res.status(403).json({ error: "Solo el creador de la reserva puede invitar jugadores externos." });
        return;
      }

      await adminDb.collection("reservationInvites").doc(token).set({
        token,
        targetType: "reservation",
        groupId: reservation.groupId ?? "default-group",
        reservationId,
        createdByAuthUid: actorAuthUid,
        createdAt: nowIso(),
        expiresAt: expiresAtIso(),
        status: "active",
        channel
      });

      res.status(200).json({ inviteLink: `${baseUrl}/join/${token}` });
      return;
    }

    res.status(400).json({ error: "targetType inválido." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudo crear la invitación." });
  }
}
