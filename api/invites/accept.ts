import { adminDb } from "../_lib/firebaseAdmin";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http";
import { requireAuthUid } from "../_lib/auth";

type AcceptInviteBody = {
  token?: string;
  displayName?: string;
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

      await adminDb.runTransaction(async (transaction) => {
        const groupRef = adminDb.collection("groups").doc(invite.groupId);
        const groupSnapshot = await transaction.get(groupRef);
        if (!groupSnapshot.exists) {
          throw new Error("Grupo no encontrado.");
        }

        const group = groupSnapshot.data() as {
          memberAuthUids: string[];
          memberNamesByAuthUid: Record<string, string>;
        };

        const memberAuthUids = group.memberAuthUids.includes(authUid)
          ? group.memberAuthUids
          : [...group.memberAuthUids, authUid];

        transaction.update(groupRef, {
          memberAuthUids,
          [`memberNamesByAuthUid.${authUid}`]: displayName,
          updatedAt: nowIso()
        });
      });

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
