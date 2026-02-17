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
    minute: "2-digit"
  }).format(new Date(iso));

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

export const getUserAttendance = (reservation: Reservation, userId: string): Signup | undefined =>
  reservation.signups
    .map((signup) => normalizeSignup(signup))
    .find((signup) => signup.userId === userId && signup.attendanceStatus !== "cancelled");

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
  if (currentAttendance) {
    return { ok: false, reason: "Ya tenés asistencia marcada" };
  }

  return { ok: true };
};

export const buildWhatsAppMessage = (reservation: Reservation, appUrl: string): string => {
  const link = `${appUrl}#reservation/${reservation.id}`;
  return [
    `🎾 Pádel - ${reservation.courtName}`,
    `📅 ${formatDateTime(reservation.startDateTime)} (${reservation.durationMinutes}m)`,
    `👤 Reserva: ${reservation.createdBy.name}`,
    `👉 Anotate acá: ${link}`
  ].join("\n");
};
