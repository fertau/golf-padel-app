import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";
import { recordGroupAuditEvent, resolveMemberName } from "../_lib/groupAudit.js";

type ReassignOwnerBody = {
  reservationId?: string;
  targetAuthUid?: string;
  targetName?: string;
};

const nowIso = () => new Date().toISOString();

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
    const body = parseBody<ReassignOwnerBody>(req.body);
    const reservationId = body.reservationId?.trim();
    const targetAuthUid = body.targetAuthUid?.trim();
    const targetName = body.targetName?.trim();

    if (!reservationId || !targetAuthUid || !targetName) {
      res.status(400).json({ error: "Faltan datos para reasignar creador." });
      return;
    }

    let actorName = "Admin";
    let nextOwnerName = targetName;
    let groupIdForAudit = "";

    await adminDb.runTransaction(async (transaction) => {
      const reservationRef = adminDb.collection("reservations").doc(reservationId);
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists) {
        throw new Error("Reserva no encontrada.");
      }

      const reservation = reservationSnapshot.data() as {
        groupId?: string;
      };
      const groupId = reservation.groupId;
      if (!groupId || groupId === "default-group") {
        throw new Error("Solo se puede reasignar creador en reservas de grupo.");
      }
      groupIdForAudit = groupId;

      const groupRef = adminDb.collection("groups").doc(groupId);
      const groupSnapshot = await transaction.get(groupRef);
      if (!groupSnapshot.exists) {
        throw new Error("Grupo no encontrado.");
      }

      const group = groupSnapshot.data() as {
        ownerAuthUid?: string;
        adminAuthUids?: string[];
        memberAuthUids?: string[];
        memberNamesByAuthUid?: Record<string, string>;
        isDeleted?: boolean;
      };

      if (group.isDeleted === true) {
        throw new Error("El grupo ya no está disponible.");
      }

      const ownerAuthUid = group.ownerAuthUid ?? "";
      const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
      const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];

      const actorIsAdmin = ownerAuthUid === actorAuthUid || adminAuthUids.includes(actorAuthUid);
      if (!actorIsAdmin) {
        throw new Error("Solo administradores del grupo pueden reasignar el creador.");
      }
      if (!memberAuthUids.includes(targetAuthUid)) {
        throw new Error("El nuevo creador debe ser miembro activo del grupo.");
      }

      actorName = resolveMemberName(group.memberNamesByAuthUid, actorAuthUid, "Admin");
      nextOwnerName = resolveMemberName(group.memberNamesByAuthUid, targetAuthUid, targetName);

      transaction.update(reservationRef, {
        createdByAuthUid: targetAuthUid,
        createdBy: {
          id: targetAuthUid,
          name: targetName
        },
        updatedAt: nowIso()
      });
    });

    await recordGroupAuditEvent({
      groupId: groupIdForAudit,
      type: "reservation_owner_reassigned",
      actorAuthUid,
      actorName,
      targetAuthUid,
      targetName: nextOwnerName,
      metadata: {
        reservationId
      }
    }).catch(() => null);

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = (error as Error).message || "No se pudo reasignar el creador.";
    const isValidationError =
      message.includes("administradores") ||
      message.includes("miembro activo") ||
      message.includes("grupo") ||
      message.includes("no encontrada");
    res.status(isValidationError ? 400 : 500).json({ error: message });
  }
}
