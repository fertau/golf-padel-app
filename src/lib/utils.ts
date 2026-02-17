import type { AttendanceStatus, Reservation, Signup, SignupResult, User } from "./types";

export const slugifyId = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || crypto.randomUUID();

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));

const formatDateTimeForMessage = (iso: string): string => {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${weekday} ${day}-${month}, ${hour}:${minute}`;
};

export const isDeadlinePassed = (reservation: Reservation): boolean => {
  if (!reservation.rules.signupDeadline) {
    return false;
  }
  return new Date(reservation.rules.signupDeadline).getTime() < Date.now();
};

export const getActiveSignups = (reservation: Reservation): Signup[] =>
  reservation.signups
    .map((signup) => normalizeSignup(signup))
    .filter((signup) => signup.attendanceStatus !== "cancelled")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const getSignupsByStatus = (reservation: Reservation, status: AttendanceStatus): Signup[] =>
  reservation.signups
    .map((signup) => normalizeSignup(signup))
    .filter((signup) => signup.attendanceStatus === status)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const getUserAttendance = (reservation: Reservation, userIdOrAuthUid: string): Signup | undefined =>
  reservation.signups
    .map((signup) => normalizeSignup(signup))
    .find(
      (signup) =>
        signup.userId === userIdOrAuthUid || signup.authUid === userIdOrAuthUid
    );

export const isReservationCreator = (reservation: Reservation, userIdOrAuthUid: string): boolean => {
  if (reservation.createdByAuthUid) {
    return reservation.createdByAuthUid === userIdOrAuthUid;
  }
  return reservation.createdBy.id === userIdOrAuthUid;
};

const normalizeSignup = (signup: Signup): Signup => {
  const legacy = signup as Signup & { active?: boolean };
  const fallbackStatus: AttendanceStatus = legacy.active === false ? "cancelled" : "confirmed";

  return {
    ...signup,
    attendanceStatus: signup.attendanceStatus ?? fallbackStatus,
    updatedAt: signup.updatedAt ?? signup.createdAt
  };
};

export const calculateSignupResult = (reservation: Reservation): SignupResult => {
  const activeSignups = getActiveSignups(reservation);
  const prioritySet = new Set(reservation.rules.priorityUserIds);

  const priority = activeSignups
    .filter((signup) => prioritySet.has(signup.userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const nonPriority = activeSignups
    .filter((signup) => !prioritySet.has(signup.userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const merged = [...priority, ...nonPriority];
  const titulares = merged.slice(0, reservation.rules.maxPlayersAccepted);
  const suplentes = merged.slice(reservation.rules.maxPlayersAccepted);

  return { titulares, suplentes };
};

export const canJoinReservation = (
  reservation: Reservation,
  user: User
): { ok: boolean; reason?: string } => {
  if (reservation.status === "cancelled") {
    return { ok: false, reason: "La reserva está cancelada" };
  }

  const currentAttendance = getUserAttendance(reservation, user.id);
  if (currentAttendance && currentAttendance.attendanceStatus !== "cancelled") {
    return { ok: false, reason: "Ya tenés asistencia marcada" };
  }

  return { ok: true };
};

export const buildWhatsAppMessage = (reservation: Reservation, appUrl: string): string => {
  const normalizedAppUrl = appUrl.replace(/\/+$/, "");
  const link = `${normalizedAppUrl}/r/${reservation.id}`;
  return [
    `🎾 Pádel - ${reservation.courtName}`,
    `📅 ${formatDateTimeForMessage(reservation.startDateTime)} (${reservation.durationMinutes}m)`,
    `👤 Reserva creada por: ${reservation.createdBy.name}`,
    "👉 Abrí este link para anotarte:",
    link
  ].join("\n\n");
};
