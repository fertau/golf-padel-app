import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc
} from "firebase/firestore";
import { auth, db, firebaseEnabled } from "./firebase";
import {
  createReservationLocal,
  updateReservationDetailsLocal,
  setAttendanceStatusLocal,
  subscribeLocalReservations,
  updateReservationLocal,
  type ReservationInput
} from "./localStore";
import type { AttendanceStatus, Reservation, ReservationRules, Signup, User } from "./types";
import { canJoinReservation } from "./utils";

const nowIso = () => new Date().toISOString();

const normalizeReservation = (id: string, data: Omit<Reservation, "id">): Reservation => ({
  id,
  ...data
});

const stripUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (nestedValue === undefined) {
        continue;
      }
      next[key] = stripUndefinedDeep(nestedValue);
    }
    return next as T;
  }

  return value;
};

export const isCloudMode = () => firebaseEnabled && Boolean(db);
export const isCloudDbEnabled = () =>
  isCloudMode() && import.meta.env.VITE_USE_FIREBASE_DB === "true";

export const subscribeReservations = (onChange: (reservations: Reservation[]) => void) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return subscribeLocalReservations(onChange);
  }

  const q = query(collection(cloudDb, "reservations"), orderBy("startDateTime", "asc"));
  return onSnapshot(q, (snapshot) => {
    const reservations = snapshot.docs.map((snapshotDoc) => {
      const data = snapshotDoc.data() as Omit<Reservation, "id">;
      return normalizeReservation(snapshotDoc.id, data);
    });

    onChange(reservations);
  });
};

export const createReservation = async (input: ReservationInput, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    createReservationLocal(input, currentUser);
    return;
  }

  const id = crypto.randomUUID();

  const payload: Reservation = {
    id,
    courtName: input.courtName.trim(),
    startDateTime: input.startDateTime,
    durationMinutes: input.durationMinutes,
    createdBy: currentUser,
    createdByAuthUid: auth?.currentUser?.uid,
    rules: {
      maxPlayersAccepted: input.rules?.maxPlayersAccepted ?? 9999,
      priorityUserIds: input.rules?.priorityUserIds ?? [],
      allowWaitlist: true
    },
    signups: [],
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await setDoc(doc(cloudDb, "reservations", id), stripUndefinedDeep(payload));
};

export const updateReservationRules = async (
  reservationId: string,
  rules: ReservationRules,
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    updateReservationLocal(reservationId, (reservation) => {
      if (reservation.createdBy.id !== currentUser.id) {
        return reservation;
      }

      return {
        ...reservation,
        rules
      };
    });
    return;
  }

  await runTransaction(cloudDb, async (transaction) => {
    const actorAuthUid = auth?.currentUser?.uid;
    if (!actorAuthUid) {
      throw new Error("Necesitás iniciar sesión para editar reglas");
    }

    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    if (
      reservation.createdByAuthUid
        ? reservation.createdByAuthUid !== actorAuthUid
        : reservation.createdBy.id !== currentUser.id
    ) {
      throw new Error("Solo el creador puede editar reglas");
    }

    transaction.update(reservationRef, stripUndefinedDeep({
      rules,
      updatedAt: nowIso()
    }));
  });
};

export const setAttendanceStatus = async (
  reservationId: string,
  user: User,
  status: AttendanceStatus
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const { error } = setAttendanceStatusLocal(reservationId, user, status);
    if (error) {
      throw new Error(error);
    }
    return;
  }

  await runTransaction(cloudDb, async (transaction) => {
    const actorAuthUid = auth?.currentUser?.uid;
    if (!actorAuthUid) {
      throw new Error("Necesitás iniciar sesión para actualizar asistencia");
    }

    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    const existing = reservation.signups.find(
      (signup) => signup.authUid === actorAuthUid || signup.userId === user.id
    );

    if (!existing && status !== "cancelled") {
      const eligibility = canJoinReservation(reservation, user);
      if (!eligibility.ok) {
        throw new Error(eligibility.reason ?? "No se pudo actualizar asistencia");
      }
    }

    let nextSignups: Signup[] = reservation.signups;

    if (existing) {
      nextSignups = reservation.signups.map((signup) =>
        signup.userId === user.id
          ? {
              ...signup,
              userName: user.name,
              authUid: actorAuthUid,
              attendanceStatus: status,
              updatedAt: nowIso()
            }
          : signup
      );
    } else if (status !== "cancelled") {
      nextSignups = [
        ...reservation.signups,
        {
          id: crypto.randomUUID(),
          reservationId,
          userId: user.id,
          authUid: actorAuthUid,
          userName: user.name,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          attendanceStatus: status
        }
      ];
    }

    transaction.update(reservationRef, stripUndefinedDeep({
      signups: nextSignups,
      updatedAt: nowIso()
    }));
  });
};

export const cancelReservation = async (reservationId: string, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    updateReservationLocal(reservationId, (reservation) => {
      if (reservation.createdBy.id !== currentUser.id) {
        return reservation;
      }

      return {
        ...reservation,
        status: "cancelled"
      };
    });
    return;
  }

  await runTransaction(cloudDb, async (transaction) => {
    const actorAuthUid = auth?.currentUser?.uid;
    if (!actorAuthUid) {
      throw new Error("Necesitás iniciar sesión para cancelar");
    }

    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    if (
      reservation.createdByAuthUid
        ? reservation.createdByAuthUid !== actorAuthUid
        : reservation.createdBy.id !== currentUser.id
    ) {
      throw new Error("Solo el creador puede cancelar");
    }

    transaction.update(reservationRef, stripUndefinedDeep({
      status: "cancelled",
      updatedAt: nowIso()
    }));
  });
};

export const updateReservationDetails = async (
  reservationId: string,
  updates: { courtName: string; startDateTime: string; durationMinutes: number },
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    updateReservationDetailsLocal(reservationId, updates, currentUser);
    return;
  }

  await runTransaction(cloudDb, async (transaction) => {
    const actorAuthUid = auth?.currentUser?.uid;
    if (!actorAuthUid) {
      throw new Error("Necesitás iniciar sesión para editar la reserva");
    }

    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);
    if (
      reservation.createdByAuthUid
        ? reservation.createdByAuthUid !== actorAuthUid
        : reservation.createdBy.id !== currentUser.id
    ) {
      throw new Error("Solo el creador puede editar");
    }

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        courtName: updates.courtName.trim(),
        startDateTime: updates.startDateTime,
        durationMinutes: updates.durationMinutes,
        updatedAt: nowIso()
      })
    );
  });
};
