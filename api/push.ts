import { adminDb } from "./_lib/firebaseAdmin.js";
import { requireAuthUid } from "./_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "./_lib/http.js";
import { sendPushToUsers } from "./_lib/pushSend.js";
import { buildMatchInfo, buildNotification, type NotificationEventType } from "./_lib/notificationMessages.js";

// ── Types ────────────────────────────────────────────────────────────────────

type PreferencesBody = {
  pushEnabled?: boolean;
  notifications?: Record<string, boolean>;
};

type RegisterBody = {
  token?: string;
  platform?: string;
  userAgent?: string;
};

type Reminder2hBody = { reservationId?: string };

type TriggerBody = {
  eventType: NotificationEventType;
  reservationId: string;
  playerName?: string;
  attendanceAction?: "confirmed" | "cancelled";
  previousConfirmedCount?: number;
};

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handlePreferences(
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

async function handleRegister(
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

async function handleReminder2h(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await requireAuthUid(req);
    const body = parseBody<Reminder2hBody>(req.body);
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

async function handleTrigger(
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
    const attendanceMap: Record<string, string> = reservation.attendance ?? {};
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
    for (const [uid, status] of Object.entries(attendanceMap)) {
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
    case "preferences":
      return handlePreferences(req, res);
    case "register":
      return handleRegister(req, res);
    case "reminder-2h":
      return handleReminder2h(req, res);
    case "trigger":
      return handleTrigger(req, res);
    default:
      res.status(400).json({ error: "Unknown action. Use ?action=preferences|register|reminder-2h|trigger" });
  }
}
