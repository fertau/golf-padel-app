import { adminDb } from "../_lib/firebaseAdmin.js";
import { sendPushToUsers } from "../_lib/pushSend.js";
import type { VercelRequestLike, VercelResponseLike } from "../_lib/http.js";

/**
 * Daily cron job for time-based notifications.
 * Finds matches in the next 24h that haven't been reminded yet.
 * Secured with CRON_SECRET env var.
 */
export default async function handler(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers?.authorization;
    const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!raw || raw !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find active reservations in the next 24 hours
    const snapshot = await adminDb
      .collection("reservations")
      .where("status", "!=", "cancelled")
      .get();

    let reminded = 0;
    let skipped = 0;

    for (const doc of snapshot.docs) {
      const reservation = doc.data();

      // Parse date
      const dateStr = reservation.date ?? reservation.startTime;
      if (!dateStr) {
        skipped++;
        continue;
      }

      const matchDate = new Date(dateStr);
      if (isNaN(matchDate.getTime())) {
        skipped++;
        continue;
      }

      // Check if match is within 24h
      if (matchDate <= now || matchDate > in24h) {
        skipped++;
        continue;
      }

      // Check idempotency: skip if already notified
      const notificationsSent = reservation.notificationsSent ?? {};
      if (notificationsSent.reminder_24h) {
        skipped++;
        continue;
      }

      // Skip cancelled reservations
      if (reservation.isCancelled || reservation.status === "cancelled") {
        skipped++;
        continue;
      }

      // Find unconfirmed players in the group
      const groupId = reservation.groupId;
      if (!groupId) {
        skipped++;
        continue;
      }

      const groupDoc = await adminDb.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        skipped++;
        continue;
      }

      const groupData = groupDoc.data();
      const members: string[] = groupData?.memberAuthUids ?? [];

      // Get confirmed players
      const attendance = reservation.attendance ?? {};
      const confirmedUids = Object.entries(attendance)
        .filter(([, status]) => status === "confirmed")
        .map(([uid]) => uid);

      // Unconfirmed = group members who haven't confirmed
      const unconfirmedUids = members.filter(uid => !confirmedUids.includes(uid));

      if (unconfirmedUids.length === 0) {
        skipped++;
        continue;
      }

      // Format match info for notification
      const day = matchDate.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
      const time = matchDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      const court = reservation.courtName ?? reservation.venueName ?? "";
      const courtStr = court ? ` en ${court}` : "";

      await sendPushToUsers(
        unconfirmedUids,
        {
          title: "Partido mañana",
          body: `${day} ${time}${courtStr}. ¿Confirmás?`,
          data: { url: `/partidos/${doc.id}`, eventType: "reminder_24h" },
        },
        "reminder_24h"
      );

      // Mark as notified (idempotency)
      await adminDb.collection("reservations").doc(doc.id).update({
        "notificationsSent.reminder_24h": true,
      });

      reminded++;
    }

    res.status(200).json({ ok: true, reminded, skipped });
  } catch (error) {
    console.error("[cron/reminders] Error:", (error as Error).message);
    res.status(500).json({ error: (error as Error).message || "Error al enviar recordatorios." });
  }
}
