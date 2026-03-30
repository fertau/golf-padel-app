/**
 * Notification message templates (Spanish).
 * All push notification copy lives here for DRY + easy editing.
 */

export type NotificationEventType =
  | "match_created"
  | "attendance_change"
  | "need_players"
  | "match_full"
  | "match_cancelled"
  | "reminder_24h"
  | "reminder_2h";

type MatchInfo = {
  day: string;
  time: string;
  court: string;
  playerName?: string;
  playersNeeded?: number;
  reservationId: string;
};

type NotificationTemplate = {
  title: string;
  body: string;
  vibrate?: number[];
};

const formatCourt = (court: string) => (court ? ` en ${court}` : "");

export function buildNotification(
  eventType: NotificationEventType,
  info: MatchInfo
): NotificationTemplate {
  const courtStr = formatCourt(info.court);

  switch (eventType) {
    case "match_created":
      return {
        title: "Nuevo partido",
        body: `${info.playerName ?? "Alguien"} creó un partido: ${info.day} ${info.time}${courtStr}`,
      };
    case "attendance_change":
      return {
        title: "Cambio de asistencia",
        body: `${info.playerName ?? "Alguien"} confirmó para ${info.day}`,
      };
    case "need_players":
      return {
        title: "¡Faltan jugadores!",
        body: `Faltan ${info.playersNeeded ?? "?"} para ${info.day} ${info.time}${courtStr}. ¿Te sumás?`,
        vibrate: [100, 50, 100, 50, 200],
      };
    case "match_full":
      return {
        title: "¡Partido completo!",
        body: `Ya están los 4 para ${info.day} ${info.time}. ¡Nos vemos!`,
      };
    case "match_cancelled":
      return {
        title: "Partido cancelado",
        body: `Se canceló el partido del ${info.day} ${info.time}${courtStr}`,
      };
    case "reminder_24h":
      return {
        title: "Partido mañana",
        body: `${info.day} ${info.time}${courtStr}. ¿Confirmás?`,
      };
    case "reminder_2h":
      return {
        title: "En 2 horas jugamos",
        body: `${info.time}${courtStr}. ¡Nos vemos ahí!`,
      };
  }
}

/**
 * Build match info from a reservation document for notification templates.
 */
export function buildMatchInfo(reservation: Record<string, unknown>, reservationId: string): Omit<MatchInfo, "playerName" | "playersNeeded"> {
  const dateStr = (reservation.date ?? reservation.startTime) as string | undefined;
  const matchDate = dateStr ? new Date(dateStr) : new Date();

  const day = matchDate.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  const time = matchDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const court = (reservation.courtName ?? reservation.venueName ?? "") as string;

  return { day, time, court, reservationId };
}
