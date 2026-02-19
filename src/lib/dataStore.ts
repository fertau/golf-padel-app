import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where
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
import {
  addGroupMemberLocal,
  createCourtLocal,
  createGroupInviteLocal,
  createGroupLocal,
  createReservationInviteLocal,
  createVenueLocal,
  ensureDefaultGroupLocal,
  getInviteByTokenLocal,
  getLocalGroups,
  linkVenueToGroupLocal,
  subscribeLocalCourts,
  subscribeLocalGroupsForUser,
  subscribeLocalVenues
} from "./groupLocalStore";
import type {
  AttendanceStatus,
  Court,
  Group,
  GroupInvite,
  Reservation,
  ReservationInvite,
  ReservationRules,
  Signup,
  User,
  Venue
} from "./types";
import { canJoinReservation, isReservationCreator } from "./utils";

const nowIso = () => new Date().toISOString();
const inviteExpirationIso = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const normalizeReservation = (id: string, data: Omit<Reservation, "id">): Reservation => ({
  id,
  ...data,
  groupId: data.groupId ?? "default-group",
  groupName: data.groupName ?? "Mi grupo",
  guestAccessUids: data.guestAccessUids ?? []
});

const normalizeGroup = (id: string, data: Omit<Group, "id">): Group => ({
  id,
  ...data,
  memberAuthUids: data.memberAuthUids ?? [],
  adminAuthUids: data.adminAuthUids ?? [],
  memberNamesByAuthUid: data.memberNamesByAuthUid ?? {},
  venueIds: data.venueIds ?? []
});

const normalizeVenue = (id: string, data: Omit<Venue, "id">): Venue => ({
  id,
  ...data
});

const normalizeCourt = (id: string, data: Omit<Court, "id">): Court => ({
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

const groupCollection = "groups";
const venueCollection = "venues";
const courtCollection = "courts";
const reservationCollection = "reservations";
const groupInviteCollection = "groupInvites";
const reservationInviteCollection = "reservationInvites";

const isGroupAdmin = (group: Group, authUid: string) =>
  group.ownerAuthUid === authUid || group.adminAuthUids.includes(authUid);

const canAccessReservation = (reservation: Reservation, authUid: string, allowedGroupIds: Set<string>) => {
  if (!reservation.groupId || reservation.groupId === "default-group") {
    return true;
  }
  if (allowedGroupIds.has(reservation.groupId)) {
    return true;
  }
  if (reservation.createdByAuthUid === authUid || reservation.createdBy.id === authUid) {
    return true;
  }
  if (reservation.guestAccessUids?.includes(authUid)) {
    return true;
  }
  return reservation.signups.some((signup) => signup.authUid === authUid || signup.userId === authUid);
};

const ensureGroupMembership = (group: Group, authUid: string) => {
  if (!group.memberAuthUids.includes(authUid)) {
    throw new Error("No tenés acceso a este grupo.");
  }
};

const resolveCloudVenueAndCourt = async (
  input: ReservationInput,
  actorAuthUid: string
): Promise<{ venue?: Venue; court?: Court }> => {
  const cloudDb = db;
  if (!cloudDb) {
    return {};
  }

  let venue: Venue | undefined;
  if (input.venueId) {
    const venueSnapshot = await getDoc(doc(cloudDb, venueCollection, input.venueId));
    if (venueSnapshot.exists()) {
      venue = normalizeVenue(venueSnapshot.id, venueSnapshot.data() as Omit<Venue, "id">);
    }
  } else if (input.venueName?.trim()) {
    const id = crypto.randomUUID();
    venue = {
      id,
      name: input.venueName.trim(),
      address: input.venueAddress?.trim() ?? "",
      mapsUrl: input.venueMapsUrl,
      createdByAuthUid: actorAuthUid,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await setDoc(doc(cloudDb, venueCollection, id), stripUndefinedDeep(venue));
  }

  let court: Court | undefined;
  if (venue) {
    if (input.courtId) {
      const courtSnapshot = await getDoc(doc(cloudDb, courtCollection, input.courtId));
      if (courtSnapshot.exists()) {
        court = normalizeCourt(courtSnapshot.id, courtSnapshot.data() as Omit<Court, "id">);
      }
    }

    if (!court && input.courtName?.trim()) {
      const candidateName = input.courtName.trim();
      const existingQuery = query(collection(cloudDb, courtCollection), where("venueId", "==", venue.id));
      const existingSnapshot = await getDocs(existingQuery);
      const existingDoc = existingSnapshot.docs.find(
        (snapshotDoc) =>
          (snapshotDoc.data() as Omit<Court, "id">).name.trim().toLowerCase() === candidateName.toLowerCase()
      );

      if (existingDoc) {
        court = normalizeCourt(existingDoc.id, existingDoc.data() as Omit<Court, "id">);
      } else {
        const id = crypto.randomUUID();
        court = {
          id,
          venueId: venue.id,
          name: candidateName,
          createdByAuthUid: actorAuthUid,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        await setDoc(doc(cloudDb, courtCollection, id), stripUndefinedDeep(court));
      }
    }
  }

  return { venue, court };
};

const linkVenueInCloudGroup = async (groupId: string, venueId: string) => {
  const cloudDb = db;
  if (!cloudDb) {
    return;
  }
  await runTransaction(cloudDb, async (transaction) => {
    const groupRef = doc(cloudDb, groupCollection, groupId);
    const groupSnapshot = await transaction.get(groupRef);
    if (!groupSnapshot.exists()) {
      return;
    }
    const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
    if (group.venueIds.includes(venueId)) {
      return;
    }
    transaction.update(groupRef, {
      venueIds: [...group.venueIds, venueId],
      updatedAt: nowIso()
    });
  });
};

const resolveLocalVenueAndCourt = (
  input: ReservationInput,
  actorAuthUid: string
): { venue?: Venue; court?: Court } => {
  let venue: Venue | undefined;
  if (input.venueId) {
    venue = undefined;
  } else if (input.venueName?.trim()) {
    venue = createVenueLocal(
      {
        name: input.venueName,
        address: input.venueAddress ?? "",
        mapsUrl: input.venueMapsUrl
      },
      actorAuthUid
    );
  }

  let court: Court | undefined;
  if (venue && input.courtName?.trim()) {
    court = createCourtLocal(venue.id, input.courtName, actorAuthUid);
  }

  return { venue, court };
};

export const isCloudMode = () => firebaseEnabled && Boolean(db);
export const isCloudDbEnabled = () =>
  isCloudMode() && import.meta.env.VITE_USE_FIREBASE_DB === "true";

export const subscribeReservations = (
  currentAuthUid: string,
  onChange: (reservations: Reservation[]) => void
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return subscribeLocalReservations(onChange);
  }

  let reservationsCache: Reservation[] = [];
  let allowedGroupIds = new Set<string>();

  const emit = () => {
    const filtered = reservationsCache
      .filter((reservation) => canAccessReservation(reservation, currentAuthUid, allowedGroupIds))
      .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
    onChange(filtered);
  };

  const groupsQuery = query(
    collection(cloudDb, groupCollection),
    where("memberAuthUids", "array-contains", currentAuthUid)
  );

  const reservationsQuery = query(collection(cloudDb, reservationCollection), orderBy("startDateTime", "asc"));

  const unsubscribeGroups = onSnapshot(groupsQuery, (snapshot) => {
    allowedGroupIds = new Set(snapshot.docs.map((snapshotDoc) => snapshotDoc.id));
    emit();
  });

  const unsubscribeReservations = onSnapshot(reservationsQuery, (snapshot) => {
    reservationsCache = snapshot.docs.map((snapshotDoc) =>
      normalizeReservation(snapshotDoc.id, snapshotDoc.data() as Omit<Reservation, "id">)
    );
    emit();
  });

  return () => {
    unsubscribeGroups();
    unsubscribeReservations();
  };
};

export const subscribeGroups = (currentAuthUid: string, onChange: (groups: Group[]) => void) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return subscribeLocalGroupsForUser(currentAuthUid, onChange);
  }

  const q = query(collection(cloudDb, groupCollection), where("memberAuthUids", "array-contains", currentAuthUid));
  return onSnapshot(q, (snapshot) => {
    const groups = snapshot.docs
      .map((snapshotDoc) => normalizeGroup(snapshotDoc.id, snapshotDoc.data() as Omit<Group, "id">))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    onChange(groups);
  });
};

export const subscribeVenues = (onChange: (venues: Venue[]) => void) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return subscribeLocalVenues(onChange);
  }

  const q = query(collection(cloudDb, venueCollection), orderBy("name", "asc"));
  return onSnapshot(q, (snapshot) => {
    const venues = snapshot.docs.map((snapshotDoc) =>
      normalizeVenue(snapshotDoc.id, snapshotDoc.data() as Omit<Venue, "id">)
    );
    onChange(venues);
  });
};

export const subscribeCourts = (onChange: (courts: Court[]) => void) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return subscribeLocalCourts(onChange);
  }

  const q = query(collection(cloudDb, courtCollection), orderBy("name", "asc"));
  return onSnapshot(q, (snapshot) => {
    const courts = snapshot.docs.map((snapshotDoc) =>
      normalizeCourt(snapshotDoc.id, snapshotDoc.data() as Omit<Court, "id">)
    );
    onChange(courts);
  });
};

export const ensureUserDefaultGroup = async (currentUser: User): Promise<Group> => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return ensureDefaultGroupLocal(currentUser);
  }

  const q = query(
    collection(cloudDb, groupCollection),
    where("memberAuthUids", "array-contains", currentUser.id),
    limit(1)
  );
  const existingSnapshot = await getDocs(q);
  if (!existingSnapshot.empty) {
    const existing = existingSnapshot.docs[0];
    return normalizeGroup(existing.id, existing.data() as Omit<Group, "id">);
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const group: Group = {
    id,
    name: "Mi grupo",
    ownerAuthUid: currentUser.id,
    memberAuthUids: [currentUser.id],
    adminAuthUids: [currentUser.id],
    memberNamesByAuthUid: {
      [currentUser.id]: currentUser.name
    },
    venueIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await setDoc(doc(cloudDb, groupCollection, id), stripUndefinedDeep(group));
  return group;
};

export const createGroup = async (name: string, currentUser: User): Promise<Group> => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return createGroupLocal(name, currentUser);
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Ingresá un nombre de grupo.");
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const group: Group = {
    id,
    name: trimmedName,
    ownerAuthUid: currentUser.id,
    memberAuthUids: [currentUser.id],
    adminAuthUids: [currentUser.id],
    memberNamesByAuthUid: {
      [currentUser.id]: currentUser.name
    },
    venueIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await setDoc(doc(cloudDb, groupCollection, id), stripUndefinedDeep(group));
  return group;
};

export const createReservation = async (input: ReservationInput, currentUser: User) => {
  const cloudDb = db;
  if (!input.groupId) {
    throw new Error("Seleccioná un grupo.");
  }

  if (!isCloudDbEnabled() || !cloudDb) {
    const localGroups = getLocalGroups();
    const group = localGroups.find((candidate) => candidate.id === input.groupId) ?? ensureDefaultGroupLocal(currentUser);
    const actorAuthUid = currentUser.id;
    const resolved = resolveLocalVenueAndCourt(input, actorAuthUid);
    if (resolved.venue) {
      linkVenueToGroupLocal(group.id, resolved.venue.id);
    }

    createReservationLocal(
      {
        ...input,
        groupId: group.id,
        groupName: group.name,
        venueId: input.venueId ?? resolved.venue?.id,
        venueName: input.venueName ?? resolved.venue?.name,
        venueAddress: input.venueAddress ?? resolved.venue?.address,
        courtId: input.courtId ?? resolved.court?.id,
        courtName: (input.courtName || resolved.court?.name || "Cancha 1").trim()
      },
      currentUser
    );
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  const groupSnapshot = await getDoc(doc(cloudDb, groupCollection, input.groupId));
  if (!groupSnapshot.exists()) {
    throw new Error("Grupo no encontrado.");
  }
  const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
  ensureGroupMembership(group, actorAuthUid);

  const { venue, court } = await resolveCloudVenueAndCourt(input, actorAuthUid);
  if (venue) {
    await linkVenueInCloudGroup(group.id, venue.id);
  }

  const id = crypto.randomUUID();
  const payload: Reservation = {
    id,
    groupId: group.id,
    groupName: group.name,
    venueId: input.venueId ?? venue?.id,
    venueName: input.venueName?.trim() || venue?.name,
    venueAddress: input.venueAddress?.trim() || venue?.address,
    courtId: input.courtId ?? court?.id,
    courtName: (input.courtName || court?.name || "Cancha 1").trim(),
    startDateTime: input.startDateTime,
    durationMinutes: input.durationMinutes,
    createdBy: currentUser,
    createdByAuthUid: actorAuthUid,
    guestAccessUids: [],
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

  await setDoc(doc(cloudDb, reservationCollection, id), stripUndefinedDeep(payload));
};

export const updateReservationRules = async (
  reservationId: string,
  rules: ReservationRules,
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    updateReservationLocal(reservationId, (reservation) => {
      if (!isReservationCreator(reservation, currentUser.id)) {
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

    const reservationRef = doc(cloudDb, reservationCollection, reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);

    if (!isReservationCreator(reservation, actorAuthUid)) {
      throw new Error("Solo el creador puede editar reglas");
    }

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        rules,
        updatedAt: nowIso()
      })
    );
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

    const reservationRef = doc(cloudDb, reservationCollection, reservationId);
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
        signup.id === existing.id ||
        signup.authUid === actorAuthUid ||
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
    } else {
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

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        signups: nextSignups,
        updatedAt: nowIso()
      })
    );
  });
};

export const cancelReservation = async (reservationId: string, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    updateReservationLocal(reservationId, (reservation) => {
      if (!isReservationCreator(reservation, currentUser.id)) {
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

    const reservationRef = doc(cloudDb, reservationCollection, reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);
    let allowed = isReservationCreator(reservation, actorAuthUid);
    if (!allowed && reservation.groupId) {
      const groupSnapshot = await transaction.get(doc(cloudDb, groupCollection, reservation.groupId));
      if (groupSnapshot.exists()) {
        const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
        allowed = isGroupAdmin(group, actorAuthUid);
      }
    }
    if (!allowed) {
      throw new Error("Solo el creador o un admin del grupo puede cancelar");
    }

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        status: "cancelled",
        updatedAt: nowIso()
      })
    );
  });
};

export const updateReservationDetails = async (
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

    const reservationRef = doc(cloudDb, reservationCollection, reservationId);
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("Reserva no encontrada");
    }

    const reservation = normalizeReservation(reservationId, snapshot.data() as Omit<Reservation, "id">);
    let allowed = isReservationCreator(reservation, actorAuthUid);
    if (!allowed && reservation.groupId) {
      const groupSnapshot = await transaction.get(doc(cloudDb, groupCollection, reservation.groupId));
      if (groupSnapshot.exists()) {
        const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
        allowed = isGroupAdmin(group, actorAuthUid);
      }
    }
    if (!allowed) {
      throw new Error("Solo el creador o un admin del grupo puede editar");
    }

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        courtName: updates.courtName.trim(),
        courtId: updates.courtId,
        venueId: updates.venueId,
        venueName: updates.venueName,
        venueAddress: updates.venueAddress,
        startDateTime: updates.startDateTime,
        durationMinutes: updates.durationMinutes,
        updatedAt: nowIso()
      })
    );
  });
};

export const createGroupInviteLink = async (
  groupId: string,
  currentUser: User,
  baseUrl: string
): Promise<string> => {
  const cloudDb = db;
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (!isCloudDbEnabled() || !cloudDb) {
    const invite = createGroupInviteLocal(groupId, currentUser.id, "link");
    return `${normalizedBase}/join/${invite.token}`;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  const groupSnapshot = await getDoc(doc(cloudDb, groupCollection, groupId));
  if (!groupSnapshot.exists()) {
    throw new Error("Grupo no encontrado.");
  }
  const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
  if (!isGroupAdmin(group, actorAuthUid)) {
    throw new Error("Solo administradores del grupo pueden invitar.");
  }

  const token = crypto.randomUUID();
  const invite: GroupInvite = {
    token,
    targetType: "group",
    groupId,
    createdByAuthUid: actorAuthUid,
    createdAt: nowIso(),
    expiresAt: inviteExpirationIso(),
    status: "active",
    channel: "link"
  };
  await setDoc(doc(cloudDb, groupInviteCollection, token), stripUndefinedDeep(invite));
  return `${normalizedBase}/join/${token}`;
};

export const createReservationInviteLink = async (
  reservationId: string,
  currentUser: User,
  baseUrl: string
): Promise<string> => {
  const cloudDb = db;
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (!isCloudDbEnabled() || !cloudDb) {
    const reservation = (() => {
      const localGroups = getLocalGroups();
      const membershipGroupId = localGroups.find((group) => group.memberAuthUids.includes(currentUser.id))?.id ?? "default-group";
      return { groupId: membershipGroupId };
    })();
    const invite = createReservationInviteLocal(reservation.groupId, reservationId, currentUser.id, "link");
    return `${normalizedBase}/join/${invite.token}`;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  const reservationSnapshot = await getDoc(doc(cloudDb, reservationCollection, reservationId));
  if (!reservationSnapshot.exists()) {
    throw new Error("Reserva no encontrada.");
  }
  const reservation = normalizeReservation(
    reservationSnapshot.id,
    reservationSnapshot.data() as Omit<Reservation, "id">
  );

  let allowed = isReservationCreator(reservation, actorAuthUid);
  if (!allowed && reservation.groupId) {
    const groupSnapshot = await getDoc(doc(cloudDb, groupCollection, reservation.groupId));
    if (groupSnapshot.exists()) {
      const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
      allowed = isGroupAdmin(group, actorAuthUid);
    }
  }
  if (!allowed) {
    throw new Error("Solo el creador o admins del grupo pueden invitar.");
  }

  const token = crypto.randomUUID();
  const invite: ReservationInvite = {
    token,
    targetType: "reservation",
    groupId: reservation.groupId,
    reservationId: reservation.id,
    createdByAuthUid: actorAuthUid,
    createdAt: nowIso(),
    expiresAt: inviteExpirationIso(),
    status: "active",
    channel: "link"
  };
  await setDoc(doc(cloudDb, reservationInviteCollection, token), stripUndefinedDeep(invite));
  return `${normalizedBase}/join/${token}`;
};

export const acceptInviteToken = async (
  token: string,
  currentUser: User
): Promise<{ type: "group" | "reservation"; groupId: string; reservationId?: string }> => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const invite = getInviteByTokenLocal(token);
    if (!invite || invite.status !== "active" || new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new Error("Invitación inválida o vencida.");
    }
    if (invite.targetType === "group") {
      const updated = addGroupMemberLocal(invite.groupId, currentUser, "member");
      if (!updated) {
        throw new Error("No se pudo unir al grupo.");
      }
      return { type: "group", groupId: invite.groupId };
    }

    updateReservationLocal(invite.reservationId, (reservation) => ({
      ...reservation,
      guestAccessUids: reservation.guestAccessUids?.includes(currentUser.id)
        ? reservation.guestAccessUids
        : [...(reservation.guestAccessUids ?? []), currentUser.id]
    }));
    return { type: "reservation", groupId: invite.groupId, reservationId: invite.reservationId };
  }

  const groupInviteSnapshot = await getDoc(doc(cloudDb, groupInviteCollection, token));
  if (groupInviteSnapshot.exists()) {
    const invite = groupInviteSnapshot.data() as GroupInvite;
    if (invite.status !== "active" || new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new Error("Invitación vencida.");
    }
    await runTransaction(cloudDb, async (transaction) => {
      const groupRef = doc(cloudDb, groupCollection, invite.groupId);
      const groupSnapshot = await transaction.get(groupRef);
      if (!groupSnapshot.exists()) {
        throw new Error("Grupo no encontrado.");
      }
      const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
      if (!group.memberAuthUids.includes(currentUser.id)) {
        transaction.update(groupRef, {
          memberAuthUids: [...group.memberAuthUids, currentUser.id],
          memberNamesByAuthUid: {
            ...group.memberNamesByAuthUid,
            [currentUser.id]: currentUser.name
          },
          updatedAt: nowIso()
        });
      }
    });
    return { type: "group", groupId: invite.groupId };
  }

  const reservationInviteSnapshot = await getDoc(doc(cloudDb, reservationInviteCollection, token));
  if (!reservationInviteSnapshot.exists()) {
    throw new Error("Invitación no encontrada.");
  }
  const invite = reservationInviteSnapshot.data() as ReservationInvite;
  if (invite.status !== "active" || new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new Error("Invitación vencida.");
  }

  await runTransaction(cloudDb, async (transaction) => {
    const reservationRef = doc(cloudDb, reservationCollection, invite.reservationId);
    const reservationSnapshot = await transaction.get(reservationRef);
    if (!reservationSnapshot.exists()) {
      throw new Error("Reserva no encontrada.");
    }
    const reservation = normalizeReservation(
      reservationSnapshot.id,
      reservationSnapshot.data() as Omit<Reservation, "id">
    );
    if (!reservation.guestAccessUids?.includes(currentUser.id)) {
      transaction.update(reservationRef, {
        guestAccessUids: [...(reservation.guestAccessUids ?? []), currentUser.id],
        updatedAt: nowIso()
      });
    }
  });

  return { type: "reservation", groupId: invite.groupId, reservationId: invite.reservationId };
};
