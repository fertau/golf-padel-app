import type { Reservation, Signup, SignupResult, User } from "./types";

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
  reservation.signups.filter((signup) => signup.active);

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

  if (isDeadlinePassed(reservation)) {
    return { ok: false, reason: "Inscripción cerrada por horario límite" };
  }

  const alreadyJoined = getActiveSignups(reservation).some(
    (signup) => signup.userId === user.id
  );

  if (alreadyJoined) {
    return { ok: false, reason: "Ya estás anotado" };
  }

  const { titulares } = calculateSignupResult(reservation);
  const isFull = titulares.length >= reservation.rules.maxPlayersAccepted;

  if (isFull && !reservation.rules.allowWaitlist) {
    return { ok: false, reason: "Cupos completos" };
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
