import type { AttendanceStatus, Reservation, ReservationRules, Signup, User } from "./types";
import { canJoinReservation, isReservationCreator } from "./utils";

const STORAGE_KEY = "golf-padel-reservations";
const STORE_EVENT = "golf-padel-store-updated";

const nowIso = () => new Date().toISOString();

const emitStoreUpdate = () => {
  window.dispatchEvent(new Event(STORE_EVENT));
};

export const subscribeLocalReservations = (onChange: (reservations: Reservation[]) => void) => {
  const handler = () => onChange(getReservations());
  window.addEventListener(STORE_EVENT, handler);
  window.addEventListener("storage", handler);
  onChange(getReservations());

  return () => {
    window.removeEventListener(STORE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};

export const getReservations = (): Reservation[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Reservation[];
    return parsed.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
  } catch {
    return [];
  }
};

const saveReservations = (reservations: Reservation[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  emitStoreUpdate();
};

export type ReservationInput = {
  groupId?: string;
  groupName?: string;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  venueMapsUrl?: string;
  courtId?: string;
  courtName?: string;
  startDateTime: string;
  durationMinutes: number;
  rules?: Partial<ReservationRules>;
};

export const createReservationLocal = (input: ReservationInput, currentUser: User): Reservation[] => {
  const reservations = getReservations();

  const reservation: Reservation = {
    id: crypto.randomUUID(),
    groupId: input.groupId ?? "default-group",
    visibilityScope: "group",
    groupName: input.groupName ?? "Mi grupo",
    venueId: input.venueId,
    venueName: input.venueName,
    venueAddress: input.venueAddress,
    courtId: input.courtId,
    courtName: input.courtName?.trim() || "Cancha a definir",
    startDateTime: input.startDateTime,
    durationMinutes: input.durationMinutes,
    createdBy: currentUser,
    createdByAuthUid: currentUser.id,
    rules: {
      maxPlayersAccepted: input.rules?.maxPlayersAccepted ?? 9999,
      priorityUserIds: input.rules?.priorityUserIds ?? [],
      allowWaitlist: true
    },
    guestAccessUids: [],
    signups: [],
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const next = [reservation, ...reservations];
  saveReservations(next);
  return next;
};

export const updateReservationLocal = (
  reservationId: string,
  updater: (reservation: Reservation) => Reservation
): Reservation[] => {
  const reservations = getReservations();
  const next = reservations.map((reservation) =>
    reservation.id === reservationId
      ? { ...updater(reservation), updatedAt: nowIso() }
      : reservation
  );
  saveReservations(next);
  return next;
};

export const setAttendanceStatusLocal = (
  reservationId: string,
  user: User,
  status: AttendanceStatus
): { next: Reservation[]; error?: string } => {
  let error: string | undefined;

  const next = updateReservationLocal(reservationId, (reservation) => {
    const existing = reservation.signups.find((signup) => signup.userId === user.id);

    if (!existing && status !== "cancelled") {
      const eligibility = canJoinReservation(reservation, user);
      if (!eligibility.ok) {
        error = eligibility.reason;
        return reservation;
      }
    }

    if (existing) {
      return {
        ...reservation,
        signups: reservation.signups.map((signup) =>
          signup.userId === user.id
            ? {
                ...signup,
                userName: user.name,
                attendanceStatus: status,
                updatedAt: nowIso()
              }
            : signup
        )
      };
    }

    const signup: Signup = {
      id: crypto.randomUUID(),
      reservationId,
      userId: user.id,
      authUid: undefined,
      userName: user.name,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      attendanceStatus: status
    };

    return {
      ...reservation,
      signups: [...reservation.signups, signup]
    };
  });

  return { next, error };
};

export const cancelReservationLocal = (reservationId: string): Reservation[] =>
  updateReservationLocal(reservationId, (reservation) => ({
    ...reservation,
    status: "cancelled"
  }));

export const updateReservationDetailsLocal = (
  reservationId: string,
  updates: {
    courtName: string;
    courtId?: string;
    venueId?: string;
    venueName?: string;
    venueAddress?: string;
    startDateTime: string;
    durationMinutes: number;
  },
  currentUser: User
): Reservation[] =>
  updateReservationLocal(reservationId, (reservation) => {
    if (!isReservationCreator(reservation, currentUser.id)) {
      return reservation;
    }

    return {
      ...reservation,
      courtName: updates.courtName.trim(),
      courtId: updates.courtId,
      venueId: updates.venueId,
      venueName: updates.venueName,
      venueAddress: updates.venueAddress,
      startDateTime: updates.startDateTime,
      durationMinutes: updates.durationMinutes
    };
  });
