import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";
import { sendPushToUsers } from "../_lib/pushSend.js";
import { buildMatchInfo, buildNotification } from "../_lib/notificationMessages.js";

type Body = { reservationId?: string };

/**
 * POST /api/push/reminder-2h
 *
 * Client-side triggered 2h reminder. When any user opens the app and detects
 * a match within 2h, they call this endpoint. The server sends the reminder
 * to ALL confirmed players (not just the triggering user).
 *
 * Idempotent via notificationsSent.reminder_2h flag on the reservation.
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
    await requireAuthUid(req);
    const body = parseBody<Body>(req.body);
    const reservationId = body.reservationId?.trim();

    if (!reservationId) {
      res.status(400).json({ error: "Falta reservationId." });
      return;
    }

    const resDoc = await adminDb.collection("reservations").doc(reservationId).get();
    if (!resDoc.exists) {
      res.status(404).json({ error: "Reserva no encontrada." });
      return;
    }

    const reservation = resDoc.data()!;

    // Idempotency check
    if (reservation.notificationsSent?.reminder_2h) {
      res.status(200).json({ ok: true, skipped: true, reason: "already_notified" });
      return;
    }

    // Skip cancelled
    if (reservation.isCancelled || reservation.status === "cancelled") {
      res.status(200).json({ ok: true, skipped: true, reason: "cancelled" });
      return;
    }

    // Collect confirmed players
    const confirmedUids: string[] = [];
    const signups: Array<{ oddsAuthUid?: string; oddsId?: string; status?: string }> = reservation.signups ?? [];
    for (const signup of signups) {
      const uid = signup.oddsAuthUid ?? signup.oddsId;
      if (uid && (signup.status === "accepted" || signup.status === "confirmed")) {
        confirmedUids.push(uid);
      }
    }
    const attendance: Record<string, string> = reservation.attendance ?? {};
    for (const [uid, status] of Object.entries(attendance)) {
      if (status === "confirmed" && !confirmedUids.includes(uid)) {
        confirmedUids.push(uid);
      }
    }

    if (confirmedUids.length === 0) {
      res.status(200).json({ ok: true, skipped: true, reason: "no_confirmed" });
      return;
    }

    const matchInfo = buildMatchInfo(reservation, reservationId);
    const notification = buildNotification("reminder_2h", matchInfo);
    notification.data = { url: `/partidos/${reservationId}`, eventType: "reminder_2h" };

    const result = await sendPushToUsers(confirmedUids, notification, "reminder_2h");

    // Mark as sent
    await adminDb.collection("reservations").doc(reservationId).update({
      "notificationsSent.reminder_2h": true,
    });

    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[push/reminder-2h] Error:", (error as Error).message);
    res.status(500).json({ error: (error as Error).message || "Error al enviar recordatorio." });
  }
}
