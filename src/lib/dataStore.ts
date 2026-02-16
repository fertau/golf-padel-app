import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { db, firebaseEnabled, storage } from "./firebase";
import {
  addSignupLocal,
  createReservationLocal,
  removeSignupLocal,
  subscribeLocalReservations,
  updateReservationLocal,
  type ReservationInput
} from "./localStore";
import type { Reservation, ReservationRules, Signup, User } from "./types";
import { canJoinReservation } from "./utils";

const nowIso = () => new Date().toISOString();

const normalizeReservation = (id: string, data: Omit<Reservation, "id">): Reservation => ({
  id,
  ...data
});

export const isCloudMode = () => firebaseEnabled && Boolean(db);

export const subscribeReservations = (onChange: (reservations: Reservation[]) => void) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
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

const uploadScreenshotIfNeeded = async (reservationId: string, screenshotUrl?: string) => {
  if (!screenshotUrl || !screenshotUrl.startsWith("data:") || !storage) {
    return screenshotUrl;
  }

  const imageRef = ref(storage, `reservations/${reservationId}/screenshot`);
  await uploadString(imageRef, screenshotUrl, "data_url");
  return getDownloadURL(imageRef);
};

export const createReservation = async (input: ReservationInput, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
    createReservationLocal(input, currentUser);
    return;
  }

  const id = crypto.randomUUID();
  const screenshotUrl = await uploadScreenshotIfNeeded(id, input.screenshotUrl);

  const payload: Reservation = {
    id,
    courtName: input.courtName.trim(),
    startDateTime: input.startDateTime,
    durationMinutes: input.durationMinutes,
    createdBy: currentUser,
    screenshotUrl,
    rules: {
      maxPlayersAccepted: input.rules?.maxPlayersAccepted ?? 9999,
      priorityUserIds: input.rules?.priorityUserIds ?? [],
      allowWaitlist: true,
      signupDeadline: undefined
    },
    signups: [],
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await setDoc(doc(cloudDb, "reservations", id), payload);
};

export const updateReservationRules = async (
  reservationId: string,
  rules: ReservationRules,
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
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
    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    if (reservation.createdBy.id !== currentUser.id) {
      throw new Error("Solo el creador puede editar reglas");
    }

    transaction.update(reservationRef, {
      rules,
      updatedAt: nowIso()
    });
  });
};

export const joinReservation = async (reservationId: string, user: User) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
    const { error } = addSignupLocal(reservationId, user);
    if (error) {
      throw new Error(error);
    }
    return;
  }

  await runTransaction(cloudDb, async (transaction) => {
    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);
    const eligibility = canJoinReservation(reservation, user);

    if (!eligibility.ok) {
      throw new Error(eligibility.reason ?? "No se pudo anotar");
    }

    const signup: Signup = {
      id: crypto.randomUUID(),
      reservationId,
      userId: user.id,
      userName: user.name,
      createdAt: nowIso(),
      active: true
    };

    transaction.update(reservationRef, {
      signups: [...reservation.signups, signup],
      updatedAt: nowIso()
    });
  });
};

export const leaveReservation = async (reservationId: string, userId: string) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
    removeSignupLocal(reservationId, userId);
    return;
  }

  await runTransaction(cloudDb, async (transaction) => {
    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    const nextSignups = reservation.signups.map((signup) =>
      signup.userId === userId && signup.active ? { ...signup, active: false } : signup
    );

    transaction.update(reservationRef, {
      signups: nextSignups,
      updatedAt: nowIso()
    });
  });
};

export const cancelReservation = async (reservationId: string, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
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
    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    if (reservation.createdBy.id !== currentUser.id) {
      throw new Error("Solo el creador puede cancelar");
    }

    transaction.update(reservationRef, {
      status: "cancelled",
      updatedAt: nowIso()
    });
  });
};

export const updateReservationScreenshot = async (
  reservationId: string,
  screenshotUrl: string,
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudMode() || !cloudDb) {
    updateReservationLocal(reservationId, (reservation) => {
      if (reservation.createdBy.id !== currentUser.id) {
        return reservation;
      }

      return {
        ...reservation,
        screenshotUrl
      };
    });
    return;
  }

  const nextUrl = await uploadScreenshotIfNeeded(reservationId, screenshotUrl);

  await runTransaction(cloudDb, async (transaction) => {
    const reservationRef = doc(cloudDb, "reservations", reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);
    if (reservation.createdBy.id !== currentUser.id) {
      throw new Error("Solo el creador puede cambiar la captura");
    }

    transaction.update(reservationRef, {
      screenshotUrl: nextUrl,
      updatedAt: nowIso()
    });
  });
};
