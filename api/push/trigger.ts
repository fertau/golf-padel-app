import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";
import { sendPushToUsers } from "../_lib/pushSend.js";
import { buildNotification, buildMatchInfo, type NotificationEventType } from "../_lib/notificationMessages.js";

type TriggerBody = {
  eventType: NotificationEventType;
  reservationId: string;
  /** For attendance_change: the name of the player who changed */
  playerName?: string;
  /** For attendance_change: "confirmed" | "cancelled" */
  attendanceAction?: "confirmed" | "cancelled";
  /** Previous confirmed count (for need_players / match_full detection) */
  previousConfirmedCount?: number;
};

/**
 * POST /api/push/trigger
 *
 * Client calls this after a mutation (create, attend, cancel) to fire
 * the appropriate push notification. Reads current state from Firestore
 * and sends to the right recipients.
 *
 * Fire-and-forget from client perspective — errors are logged, not surfaced.
 */
export default async function handler(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actorUid = await requireAuthUid(req);
    const body = parseBody<TriggerBody>(req.body);
    const { eventType, reservationId } = body;

    if (!eventType || !reservationId) {
      res.status(400).json({ error: "Falta eventType o reservationId." });
      return;
    }

    // Read current reservation state
    const resDoc = await adminDb.collection("reservations").doc(reservationId).get();
    if (!resDoc.exists) {
      res.status(404).json({ error: "Reserva no encontrada." });
      return;
    }

    const reservation = resDoc.data()!;
    const matchInfo = buildMatchInfo(reservation, reservationId);
    const groupId = reservation.groupId as string | undefined;

    // Resolve group members
    let groupMembers: string[] = [];
    if (groupId && groupId !== "default-group") {
      const groupDoc = await adminDb.collection("groups").doc(groupId).get();
      if (groupDoc.exists) {
        groupMembers = groupDoc.data()?.memberAuthUids ?? [];
      }
    }

    // Resolve attendance
    const attendance: Record<string, string> = reservation.attendance ?? {};
    const signups: Array<{ oddsId?: string; oddsAuthUid?: string; status?: string }> = reservation.signups ?? [];

    // Build confirmed/maybe/unconfirmed from signups or attendance
    const confirmedUids: string[] = [];
    const maybeUids: string[] = [];
    for (const signup of signups) {
      const uid = signup.oddsAuthUid ?? signup.oddsId;
      if (!uid) continue;
      if (signup.status === "accepted" || signup.status === "confirmed") confirmedUids.push(uid);
      else if (signup.status === "maybe") maybeUids.push(uid);
    }
    // Also check attendance map
    for (const [uid, status] of Object.entries(attendance)) {
      if (status === "confirmed" && !confirmedUids.includes(uid)) confirmedUids.push(uid);
      if (status === "maybe" && !maybeUids.includes(uid)) maybeUids.push(uid);
    }

    const unconfirmedUids = groupMembers.filter(
      uid => !confirmedUids.includes(uid) && !maybeUids.includes(uid)
    );

    const maxPlayers = reservation.rules?.maxPlayersAccepted ?? 4;
    const creatorUid = reservation.createdByAuthUid as string | undefined;

    let recipients: string[] = [];
    let notification;

    switch (eventType) {
      case "match_created": {
        // All group members except creator
        recipients = groupMembers.filter(uid => uid !== actorUid);
        notification = buildNotification("match_created", {
          ...matchInfo,
          playerName: body.playerName,
        });
        break;
      }

      case "attendance_change": {
        // Notify creator (except when creator is the one changing)
        if (creatorUid && creatorUid !== actorUid) {
          recipients = [creatorUid];
        }
        const action = body.attendanceAction ?? "confirmed";
        notification = buildNotification("attendance_change", {
          ...matchInfo,
          playerName: body.playerName,
        });
        if (action === "cancelled") {
          notification.body = `${body.playerName ?? "Alguien"} se bajó de ${matchInfo.day}`;
        }
        break;
      }

      case "need_players": {
        // Only fire if count DROPPED from >= required to < required
        const prevCount = body.previousConfirmedCount ?? maxPlayers;
        if (prevCount >= maxPlayers && confirmedUids.length < maxPlayers) {
          const needed = maxPlayers - confirmedUids.length;
          recipients = [...maybeUids, ...unconfirmedUids];
          notification = buildNotification("need_players", {
            ...matchInfo,
            playersNeeded: needed,
          });
        }
        break;
      }

      case "match_full": {
        // Idempotent: check flag
        const notifSent = reservation.notificationsSent ?? {};
        if (notifSent.match_full) {
          res.status(200).json({ ok: true, skipped: true, reason: "already_notified" });
          return;
        }
        if (confirmedUids.length >= maxPlayers) {
          recipients = confirmedUids;
          notification = buildNotification("match_full", matchInfo);
          // Mark as sent
          await adminDb.collection("reservations").doc(reservationId).update({
            "notificationsSent.match_full": true,
          });
        }
        break;
      }

      case "match_updated": {
        // Notify all confirmed + maybe players except the editor
        recipients = [...confirmedUids, ...maybeUids].filter(uid => uid !== actorUid);
        notification = buildNotification("match_updated", matchInfo);
        break;
      }

      case "match_cancelled": {
        recipients = [...confirmedUids, ...maybeUids].filter(uid => uid !== actorUid);
        notification = buildNotification("match_cancelled", matchInfo);
        break;
      }

      default: {
        res.status(400).json({ error: `Tipo de evento no soportado: ${eventType}` });
        return;
      }
    }

    if (!notification || recipients.length === 0) {
      res.status(200).json({ ok: true, sent: 0, reason: "no_recipients" });
      return;
    }

    // Add deep link URL
    notification.data = {
      ...notification.data,
      url: `/partidos/${reservationId}`,
      eventType,
    };

    const result = await sendPushToUsers(recipients, notification, eventType);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[push/trigger] Error:", (error as Error).message);
    res.status(500).json({ error: (error as Error).message || "Error al enviar notificación." });
  }
}
