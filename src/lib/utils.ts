import { format, parseISO, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import type { AttendanceStatus, Reservation, Signup, SignupResult, User } from "./types";

export const slugifyId = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || crypto.randomUUID();

export const formatDateTime = (iso: string): string =>
  format(parseISO(iso), "eee dd/MM, HH:mm'hs'", { locale: es });

const formatDateTimeForMessage = (iso: string): string =>
  format(parseISO(iso), "eee dd/MM, HH:mm'hs'", { locale: es });

export const triggerHaptic = (style: "light" | "medium" | "heavy" = "light") => {
  if (!window.navigator.vibrate) return;
  const patterns = {
    light: [10],
    medium: [20],
    heavy: [50]
  };
  window.navigator.vibrate(patterns[style]);
};

export const copyTextWithFallback = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && document.hasFocus()) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (copied) {
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }

  return false;
};

const GENERIC_DISPLAY_NAMES = new Set(["jugador", "player", "usuario", "user", "guest"]);

export const normalizeDisplayName = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const isGenericDisplayName = (value: string): boolean => {
  const normalized = normalizeDisplayName(value).toLowerCase();
  return normalized.length === 0 || GENERIC_DISPLAY_NAMES.has(normalized);
};

export const isValidDisplayName = (value: string): boolean => {
  const normalized = normalizeDisplayName(value);
  return normalized.length >= 2 && normalized.length <= 32 && !isGenericDisplayName(normalized);
};

export const isDeadlinePassed = (reservation: Reservation): boolean => {
  if (!reservation.rules.signupDeadline) return false;
  return isAfter(new Date(), parseISO(reservation.rules.signupDeadline));
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

export const buildWhatsAppMessage = (
  reservation: Reservation,
  appUrl: string,
  overrideLink?: string
): string => {
  const normalizedAppUrl = appUrl.replace(/\/+$/, "");
  const link = overrideLink ?? `${normalizedAppUrl}/r/${reservation.id}`;
  const locationLine = reservation.venueName
    ? `📍 ${reservation.venueName}${reservation.venueAddress ? ` · ${reservation.venueAddress}` : ""}`
    : null;
  const groupLine = reservation.groupName ? `👥 ${reservation.groupName}` : null;
  return [
    `🎾 Pádel - ${reservation.courtName}`,
    `📅 ${formatDateTimeForMessage(reservation.startDateTime)} (${reservation.durationMinutes}m)`,
    groupLine,
    locationLine,
    `👤 Reserva creada por: ${reservation.createdBy.name}`,
    "👉 Abrí este link para anotarte:",
    link
  ]
    .filter(Boolean)
    .join("\n\n");
};
