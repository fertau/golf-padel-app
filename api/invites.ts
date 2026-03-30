import { adminDb } from "./_lib/firebaseAdmin.js";
import { requireAuthUid } from "./_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "./_lib/http.js";
import { recordGroupAuditEvent, resolveMemberName } from "./_lib/groupAudit.js";

// ── Types ────────────────────────────────────────────────────────────────────

type AcceptInviteBody = {
  token?: string;
  displayName?: string;
};

type InviteChannel = "whatsapp" | "email" | "link";
type InviteTargetType = "group" | "reservation";

type CreateInviteBody = {
  targetType?: InviteTargetType;
  groupId?: string;
  reservationId?: string;
  baseUrl?: string;
  channel?: InviteChannel;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleAccept(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authUid = await requireAuthUid(req);
    const body = parseBody<AcceptInviteBody>(req.body);
    const token = body.token?.trim();
    const displayName = body.displayName?.trim() || "Jugador";

    if (!token) {
      res.status(400).json({ error: "Falta token de invitación." });
      return;
    }

    const groupInviteRef = adminDb.collection("groupInvites").doc(token);
    const groupInviteSnapshot = await groupInviteRef.get();

    if (groupInviteSnapshot.exists) {
      const invite = groupInviteSnapshot.data() as {
        groupId: string;
        status: string;
        expiresAt: string;
      };

      if (invite.status !== "active" || new Date(invite.expiresAt).getTime() < Date.now()) {
        res.status(400).json({ error: "Invitación vencida o inválida." });
        return;
      }

      let joinedGroup = false;
      let actorName = displayName;
      await adminDb.runTransaction(async (transaction) => {
        const groupRef = adminDb.collection("groups").doc(invite.groupId);
        const groupSnapshot = await transaction.get(groupRef);
        if (!groupSnapshot.exists) {
          throw new Error("Grupo no encontrado.");
        }

        const group = groupSnapshot.data() as {
          memberAuthUids?: string[];
          memberNamesByAuthUid?: Record<string, string>;
          isDeleted?: boolean;
        };

        if (group.isDeleted === true) {
          throw new Error("Este grupo ya no está disponible.");
        }

        const baseMemberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
        const memberAuthUids = baseMemberAuthUids.includes(authUid)
          ? baseMemberAuthUids
          : [...baseMemberAuthUids, authUid];
        joinedGroup = !baseMemberAuthUids.includes(authUid);
        actorName = resolveMemberName(group.memberNamesByAuthUid, authUid, displayName);

        transaction.update(groupRef, {
          memberAuthUids,
          [`memberNamesByAuthUid.${authUid}`]: displayName,
          updatedAt: nowIso()
        });
      });

      if (joinedGroup) {
        await recordGroupAuditEvent({
          groupId: invite.groupId,
          type: "member_joined",
          actorAuthUid: authUid,
          actorName,
          targetAuthUid: authUid,
          targetName: displayName,
          metadata: {
            source: "invite"
          }
        }).catch(() => null);
      }

      res.status(200).json({ type: "group", groupId: invite.groupId });
      return;
    }

    const reservationInviteRef = adminDb.collection("reservationInvites").doc(token);
    const reservationInviteSnapshot = await reservationInviteRef.get();
    if (!reservationInviteSnapshot.exists) {
      res.status(404).json({ error: "Invitación no encontrada." });
      return;
    }

    const invite = reservationInviteSnapshot.data() as {
      groupId: string;
      reservationId: string;
      status: string;
      expiresAt: string;
    };

    if (invite.status !== "active" || new Date(invite.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "Invitación vencida o inválida." });
      return;
    }

    await adminDb.runTransaction(async (transaction) => {
      const reservationRef = adminDb.collection("reservations").doc(invite.reservationId);
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists) {
        throw new Error("Reserva no encontrada.");
      }

      const reservation = reservationSnapshot.data() as { guestAccessUids?: string[] };
      const guestAccessUids = reservation.guestAccessUids ?? [];
      if (!guestAccessUids.includes(authUid)) {
        transaction.update(reservationRef, {
          guestAccessUids: [...guestAccessUids, authUid],
          updatedAt: nowIso()
        });
      }
    });

    res.status(200).json({
      type: "reservation",
      groupId: invite.groupId,
      reservationId: invite.reservationId
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudo aceptar la invitación." });
  }
}

async function handleCreate(
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

// ── Router ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequestLike & {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  },
  res: VercelResponseLike
) {
  const action = (Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action) as string | undefined;

  switch (action) {
    case "accept":
      return handleAccept(req, res);
    case "create":
      return handleCreate(req, res);
    default:
      res.status(400).json({ error: "Unknown action. Use ?action=accept|create" });
  }
}
