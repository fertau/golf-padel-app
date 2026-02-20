import {
  collection,
  deleteField,
  doc,
  type DocumentReference,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
  where
} from "firebase/firestore";
import { auth, db, firebaseEnabled } from "./firebase";
import {
  createReservationLocal,
  getReservations,
  updateReservationDetailsLocal,
  setAttendanceStatusLocal,
  subscribeLocalReservations,
  updateReservationLocal,
  type ReservationInput
} from "./localStore";
import {
  addGroupMemberLocal,
  createCourtLocal,
  createGroupLocal,
  createVenueLocal,
  deleteGroupLocal,
  ensureDefaultGroupLocal,
  getInviteByTokenLocal,
  getLocalGroups,
  getLocalVenues,
  leaveGroupLocal,
  linkVenueToGroupLocal,
  removeGroupMemberLocal,
  renameGroupLocal,
  setGroupMemberAdminLocal,
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
  ReservationVisibilityScope,
  Signup,
  User,
  Venue
} from "./types";
import { canJoinReservation, isReservationCreator } from "./utils";

const nowIso = () => new Date().toISOString();
const inviteExpirationIso = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const inferReservationVisibilityScope = (
  data: Partial<Reservation>
): ReservationVisibilityScope => {
  if (data.visibilityScope === "group" || data.visibilityScope === "link_only") {
    return data.visibilityScope;
  }
  return data.groupId && data.groupId !== "default-group" ? "group" : "link_only";
};

const normalizeReservation = (id: string, data: Omit<Reservation, "id">): Reservation => ({
  id,
  ...data,
  groupId: data.groupId ?? "default-group",
  visibilityScope: inferReservationVisibilityScope(data),
  guestAccessUids: data.guestAccessUids ?? []
});

const normalizeGroup = (id: string, data: Omit<Group, "id">): Group => ({
  id,
  ...data,
  memberAuthUids: data.memberAuthUids ?? [],
  adminAuthUids: data.adminAuthUids ?? [],
  memberNamesByAuthUid: data.memberNamesByAuthUid ?? {},
  venueIds: data.venueIds ?? [],
  isDeleted: data.isDeleted === true
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

const buildGroupMembershipQueries = (cloudDb: NonNullable<typeof db>, authUid: string) => ({
  members: query(collection(cloudDb, groupCollection), where("memberAuthUids", "array-contains", authUid)),
  owners: query(collection(cloudDb, groupCollection), where("ownerAuthUid", "==", authUid)),
  admins: query(collection(cloudDb, groupCollection), where("adminAuthUids", "array-contains", authUid))
});

const mergeGroupSlices = (groupSlices: Map<string, Map<string, Group>>) => {
  const merged = new Map<string, Group>();
  for (const slice of groupSlices.values()) {
    for (const [id, group] of slice.entries()) {
      merged.set(id, group);
    }
  }
  return Array.from(merged.values())
    .filter((group) => !group.isDeleted)
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
};

const isGroupAdmin = (group: Group, authUid: string) =>
  !group.isDeleted && (group.ownerAuthUid === authUid || group.adminAuthUids.includes(authUid));

const isReservationRelatedToUser = (reservation: Reservation, authUid: string) =>
  reservation.createdByAuthUid === authUid ||
  reservation.createdBy.id === authUid ||
  reservation.guestAccessUids?.includes(authUid) ||
  reservation.signups.some((signup) => signup.authUid === authUid || signup.userId === authUid);

const canAccessReservation = (reservation: Reservation, authUid: string, allowedGroupIds: Set<string>) => {
  const scope = inferReservationVisibilityScope(reservation);
  if (scope === "link_only") {
    return isReservationRelatedToUser(reservation, authUid);
  }
  if (reservation.groupId && allowedGroupIds.has(reservation.groupId)) {
    return true;
  }
  return isReservationRelatedToUser(reservation, authUid);
};

const ensureGroupMembership = (group: Group, authUid: string) => {
  if (group.isDeleted) {
    throw new Error("El grupo ya no está disponible.");
  }
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

const runBatchedDocUpdates = async (
  refs: DocumentReference[],
  buildData: () => Record<string, unknown>
) => {
  const cloudDb = db;
  if (!cloudDb || refs.length === 0) {
    return;
  }
  const BATCH_SIZE = 400;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const slice = refs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(cloudDb);
    slice.forEach((docRef) => {
      batch.update(docRef, buildData());
    });
    await batch.commit();
  }
};

const resolveLocalVenueAndCourt = (
  input: ReservationInput,
  actorAuthUid: string
): { venue?: Venue; court?: Court } => {
  let venue: Venue | undefined;
  if (input.venueId) {
    venue = getLocalVenues().find((item) => item.id === input.venueId);
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

  const reservationSlices = new Map<string, Map<string, Reservation>>();
  const groupSlices = new Map<string, Map<string, Group>>();
  let allowedGroupIds = new Set<string>();
  let lastAllowedGroupIdsKey = "";
  let reservationUnsubscribers: Array<() => void> = [];
  let groupUnsubscribers: Array<() => void> = [];

  const emit = () => {
    const merged = new Map<string, Reservation>();
    for (const slice of reservationSlices.values()) {
      for (const [id, reservation] of slice.entries()) {
        merged.set(id, reservation);
      }
    }
    const result = Array.from(merged.values())
      .filter((reservation) => canAccessReservation(reservation, currentAuthUid, allowedGroupIds))
      .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
    onChange(result);
  };

  const subscribeReservationSlice = (sliceKey: string, q: ReturnType<typeof query>) => {
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextSlice = new Map<string, Reservation>();
        snapshot.docs.forEach((snapshotDoc) => {
          nextSlice.set(
            snapshotDoc.id,
            normalizeReservation(snapshotDoc.id, snapshotDoc.data() as Omit<Reservation, "id">)
          );
        });
        reservationSlices.set(sliceKey, nextSlice);
        emit();
      },
      () => {
        reservationSlices.delete(sliceKey);
        emit();
      }
    );
    reservationUnsubscribers.push(unsubscribe);
  };

  const chunk = <T,>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  };

  const rebuildReservationSubscriptions = (groupIds: string[]) => {
    reservationUnsubscribers.forEach((unsubscribe) => unsubscribe());
    reservationUnsubscribers = [];
    reservationSlices.clear();

    subscribeReservationSlice(
      `creator:${currentAuthUid}`,
      query(collection(cloudDb, reservationCollection), where("createdByAuthUid", "==", currentAuthUid))
    );

    subscribeReservationSlice(
      `legacy-creator:${currentAuthUid}`,
      query(collection(cloudDb, reservationCollection), where("createdBy.id", "==", currentAuthUid))
    );

    subscribeReservationSlice(
      `guest:${currentAuthUid}`,
      query(collection(cloudDb, reservationCollection), where("guestAccessUids", "array-contains", currentAuthUid))
    );

    chunk(groupIds, 10).forEach((batch, index) => {
      subscribeReservationSlice(
        `group-batch-${index}`,
        query(collection(cloudDb, reservationCollection), where("groupId", "in", batch))
      );
    });
  };

  const syncAllowedGroupIds = () => {
    const groupIds = mergeGroupSlices(groupSlices).map((group) => group.id);
    const nextKey = groupIds.join("|");
    if (nextKey !== lastAllowedGroupIdsKey) {
      lastAllowedGroupIdsKey = nextKey;
      allowedGroupIds = new Set(groupIds);
      rebuildReservationSubscriptions(groupIds);
    }
    emit();
  };

  const subscribeGroupSlice = (sliceKey: string, q: ReturnType<typeof query>) => {
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextSlice = new Map<string, Group>();
        snapshot.docs.forEach((snapshotDoc) => {
          nextSlice.set(snapshotDoc.id, normalizeGroup(snapshotDoc.id, snapshotDoc.data() as Omit<Group, "id">));
        });
        groupSlices.set(sliceKey, nextSlice);
        syncAllowedGroupIds();
      },
      () => {
        groupSlices.delete(sliceKey);
        syncAllowedGroupIds();
      }
    );
    groupUnsubscribers.push(unsubscribe);
  };

  rebuildReservationSubscriptions([]);
  const groupQueries = buildGroupMembershipQueries(cloudDb, currentAuthUid);
  subscribeGroupSlice("group-members", groupQueries.members);
  subscribeGroupSlice("group-owners", groupQueries.owners);
  subscribeGroupSlice("group-admins", groupQueries.admins);

  return () => {
    groupUnsubscribers.forEach((unsubscribe) => unsubscribe());
    reservationUnsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

export const subscribeGroups = (currentAuthUid: string, onChange: (groups: Group[]) => void) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    return subscribeLocalGroupsForUser(currentAuthUid, onChange);
  }

  const groupSlices = new Map<string, Map<string, Group>>();
  const unsubscribers: Array<() => void> = [];

  const emit = () => {
    const groups = mergeGroupSlices(groupSlices);
    onChange(groups);
  };

  const subscribeGroupSlice = (sliceKey: string, q: ReturnType<typeof query>) => {
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextSlice = new Map<string, Group>();
        snapshot.docs.forEach((snapshotDoc) => {
          nextSlice.set(snapshotDoc.id, normalizeGroup(snapshotDoc.id, snapshotDoc.data() as Omit<Group, "id">));
        });
        groupSlices.set(sliceKey, nextSlice);
        emit();
      },
      () => {
        groupSlices.delete(sliceKey);
        emit();
      }
    );
    unsubscribers.push(unsubscribe);
  };

  const groupQueries = buildGroupMembershipQueries(cloudDb, currentAuthUid);
  subscribeGroupSlice("group-members", groupQueries.members);
  subscribeGroupSlice("group-owners", groupQueries.owners);
  subscribeGroupSlice("group-admins", groupQueries.admins);

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
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

  const groupQueries = buildGroupMembershipQueries(cloudDb, currentUser.id);
  const snapshots = await Promise.all([
    getDocs(groupQueries.members),
    getDocs(groupQueries.owners),
    getDocs(groupQueries.admins)
  ]);
  const existingGroups = snapshots
    .flatMap((snapshot) => snapshot.docs)
    .reduce((acc, snapshotDoc) => {
      if (!acc.has(snapshotDoc.id)) {
        acc.set(snapshotDoc.id, normalizeGroup(snapshotDoc.id, snapshotDoc.data() as Omit<Group, "id">));
      }
      return acc;
    }, new Map<string, Group>());

  if (existingGroups.size > 0) {
    const candidates = Array.from(existingGroups.values()).filter((group) => !group.isDeleted);
    const existing =
      candidates.find((group) => group.name.trim().toLowerCase() === "mi grupo") ??
      candidates.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))[0];

    const memberAuthUids = existing.memberAuthUids.includes(currentUser.id)
      ? existing.memberAuthUids
      : Array.from(new Set([...existing.memberAuthUids, currentUser.id]));
    const adminAuthUids = existing.adminAuthUids.includes(currentUser.id)
      ? existing.adminAuthUids
      : Array.from(new Set([...existing.adminAuthUids, currentUser.id]));
    if (
      memberAuthUids.length !== existing.memberAuthUids.length ||
      adminAuthUids.length !== existing.adminAuthUids.length
    ) {
      await setDoc(
        doc(cloudDb, groupCollection, existing.id),
        stripUndefinedDeep({
          memberAuthUids,
          adminAuthUids,
          [`memberNamesByAuthUid.${currentUser.id}`]: currentUser.name,
          updatedAt: nowIso()
        }),
        { merge: true }
      );
      return {
        ...existing,
        memberAuthUids,
        adminAuthUids,
        memberNamesByAuthUid: {
          ...existing.memberNamesByAuthUid,
          [currentUser.id]: currentUser.name
        }
      };
    }
    return existing;
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
    isDeleted: false,
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
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await setDoc(doc(cloudDb, groupCollection, id), stripUndefinedDeep(group));
  return group;
};

export const renameGroup = async (
  groupId: string,
  name: string,
  currentUser: User
): Promise<Group> => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Ingresá un nombre de grupo.");
  }

  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const updated = renameGroupLocal(groupId, trimmedName);
    if (!updated) {
      throw new Error("No se pudo renombrar el grupo.");
    }
    const reservations = getReservations();
    const next = reservations.map((reservation) =>
      reservation.groupId === groupId
        ? { ...reservation, groupName: trimmedName, updatedAt: nowIso() }
        : reservation
    );
    localStorage.setItem("golf-padel-reservations", JSON.stringify(next));
    window.dispatchEvent(new Event("golf-padel-store-updated"));
    return updated;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  await runTransaction(cloudDb, async (transaction) => {
    const groupRef = doc(cloudDb, groupCollection, groupId);
    const groupSnapshot = await transaction.get(groupRef);
    if (!groupSnapshot.exists()) {
      throw new Error("Grupo no encontrado.");
    }
    const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
    if (group.isDeleted) {
      throw new Error("El grupo ya no está disponible.");
    }
    if (!isGroupAdmin(group, actorAuthUid)) {
      throw new Error("Solo administradores pueden renombrar el grupo.");
    }
    transaction.update(groupRef, {
      name: trimmedName,
      updatedAt: nowIso()
    });
  });

  const reservationsSnapshot = await getDocs(
    query(collection(cloudDb, reservationCollection), where("groupId", "==", groupId))
  );
  await Promise.all(
    reservationsSnapshot.docs.map((reservationDoc) =>
      setDoc(
        doc(cloudDb, reservationCollection, reservationDoc.id),
        {
          groupName: trimmedName,
          updatedAt: nowIso()
        },
        { merge: true }
      )
    )
  );

  return {
    id: groupId,
    name: trimmedName,
    ownerAuthUid: currentUser.id,
    memberAuthUids: [],
    adminAuthUids: [],
    memberNamesByAuthUid: {},
    venueIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
};

export const migrateLegacyReservationsForUser = async (
  currentUser: User,
  fallbackGroupId: string,
  fallbackGroupName: string
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const reservations = getReservations();
    let hasChanges = false;
    const next = reservations.map((reservation) => {
      let changed = false;
      const nextReservation: Reservation = { ...reservation };
      if (!nextReservation.groupId || nextReservation.groupId === "default-group") {
        nextReservation.groupId = fallbackGroupId;
        nextReservation.groupName = fallbackGroupName;
        nextReservation.visibilityScope = "group";
        changed = true;
      } else if (!nextReservation.visibilityScope) {
        nextReservation.visibilityScope = inferReservationVisibilityScope(nextReservation);
        changed = true;
      }
      if (
        !nextReservation.createdByAuthUid &&
        (nextReservation.createdBy.id === currentUser.id || nextReservation.createdBy.name === currentUser.name)
      ) {
        nextReservation.createdByAuthUid = currentUser.id;
        changed = true;
      }
      if (changed) {
        nextReservation.updatedAt = nowIso();
        hasChanges = true;
      }
      return nextReservation;
    });
    if (hasChanges) {
      localStorage.setItem("golf-padel-reservations", JSON.stringify(next));
      window.dispatchEvent(new Event("golf-padel-store-updated"));
    }
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) return;

  const legacyByGroupQuery = query(collection(cloudDb, reservationCollection), where("groupId", "==", "default-group"));
  const legacyByCreatorQuery = query(collection(cloudDb, reservationCollection), where("createdByAuthUid", "==", actorAuthUid));
  const legacyByLegacyCreatorIdQuery = query(
    collection(cloudDb, reservationCollection),
    where("createdBy.id", "==", actorAuthUid)
  );
  const [legacyByGroupSnapshot, legacyByCreatorSnapshot, legacyByLegacyCreatorIdSnapshot] = await Promise.all([
    getDocs(legacyByGroupQuery),
    getDocs(legacyByCreatorQuery),
    getDocs(legacyByLegacyCreatorIdQuery)
  ]);
  const snapshots = [
    ...legacyByGroupSnapshot.docs,
    ...legacyByCreatorSnapshot.docs,
    ...legacyByLegacyCreatorIdSnapshot.docs
  ];
  if (snapshots.length === 0) return;
  const uniqueById = new Map<string, typeof snapshots[number]>();
  snapshots.forEach((snapshotDoc) => uniqueById.set(snapshotDoc.id, snapshotDoc));

  await runTransaction(cloudDb, async (transaction) => {
    for (const snapshotDoc of uniqueById.values()) {
      const reservation = normalizeReservation(snapshotDoc.id, snapshotDoc.data() as Omit<Reservation, "id">);
      const isOwnedByActor =
        reservation.createdByAuthUid === actorAuthUid || reservation.createdBy.id === actorAuthUid;
      if (!isOwnedByActor) {
        continue;
      }

      const updates: Partial<Reservation> & { updatedAt: string } = { updatedAt: nowIso() };
      let changed = false;

      if (!reservation.groupId || reservation.groupId === "default-group") {
        updates.groupId = fallbackGroupId;
        updates.groupName = fallbackGroupName;
        updates.visibilityScope = "group";
        changed = true;
      } else if (!reservation.visibilityScope) {
        updates.visibilityScope = inferReservationVisibilityScope(reservation);
        changed = true;
      }

      if (!reservation.createdByAuthUid && reservation.createdBy.id === actorAuthUid) {
        updates.createdByAuthUid = actorAuthUid;
        changed = true;
      }

      if (!changed) {
        continue;
      }

      transaction.update(doc(cloudDb, reservationCollection, reservation.id), stripUndefinedDeep(updates));
    }
  });
};

export const setGroupMemberAdmin = async (
  groupId: string,
  targetAuthUid: string,
  makeAdmin: boolean,
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const localGroup = getLocalGroups().find((group) => group.id === groupId);
    if (!localGroup) {
      throw new Error("Grupo no encontrado.");
    }
    if (localGroup.isDeleted) {
      throw new Error("El grupo ya no está disponible.");
    }
    if (!isGroupAdmin(localGroup, currentUser.id)) {
      throw new Error("Solo administradores pueden gestionar roles.");
    }
    const updated = setGroupMemberAdminLocal(groupId, targetAuthUid, makeAdmin);
    if (!updated) {
      throw new Error("No se pudo actualizar el rol.");
    }
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  await runTransaction(cloudDb, async (transaction) => {
    const groupRef = doc(cloudDb, groupCollection, groupId);
    const groupSnapshot = await transaction.get(groupRef);
    if (!groupSnapshot.exists()) {
      throw new Error("Grupo no encontrado.");
    }
    const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
    if (group.isDeleted) {
      throw new Error("El grupo ya no está disponible.");
    }
    if (!isGroupAdmin(group, actorAuthUid)) {
      throw new Error("Solo administradores pueden gestionar roles.");
    }
    if (!group.memberAuthUids.includes(targetAuthUid)) {
      throw new Error("El usuario no es miembro del grupo.");
    }
    if (group.ownerAuthUid === targetAuthUid) {
      throw new Error("El owner siempre mantiene permisos de admin.");
    }

    const adminAuthUidsBase = makeAdmin
      ? Array.from(new Set([...group.adminAuthUids, targetAuthUid]))
      : group.adminAuthUids.filter((authUid) => authUid !== targetAuthUid);
    const adminAuthUids = Array.from(new Set([...adminAuthUidsBase, group.ownerAuthUid]));

    if (adminAuthUids.length === 0) {
      throw new Error("El grupo debe tener al menos un admin.");
    }

    transaction.update(groupRef, {
      adminAuthUids,
      updatedAt: nowIso()
    });
  });
};

export const removeGroupMember = async (
  groupId: string,
  targetAuthUid: string,
  currentUser: User
) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const localGroup = getLocalGroups().find((group) => group.id === groupId);
    if (!localGroup) {
      throw new Error("Grupo no encontrado.");
    }
    if (!isGroupAdmin(localGroup, currentUser.id)) {
      throw new Error("Solo administradores pueden quitar miembros.");
    }
    if (localGroup.ownerAuthUid === targetAuthUid) {
      throw new Error("No podés quitar al admin principal.");
    }
    const updated = removeGroupMemberLocal(groupId, targetAuthUid);
    if (!updated) {
      throw new Error("No se pudo quitar al miembro.");
    }
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  await runTransaction(cloudDb, async (transaction) => {
    const groupRef = doc(cloudDb, groupCollection, groupId);
    const groupSnapshot = await transaction.get(groupRef);
    if (!groupSnapshot.exists()) {
      throw new Error("Grupo no encontrado.");
    }
    const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
    if (group.isDeleted) {
      throw new Error("El grupo ya no está disponible.");
    }
    if (!isGroupAdmin(group, actorAuthUid)) {
      throw new Error("Solo administradores pueden quitar miembros.");
    }
    if (!group.memberAuthUids.includes(targetAuthUid)) {
      throw new Error("El usuario no es miembro del grupo.");
    }
    if (group.ownerAuthUid === targetAuthUid) {
      throw new Error("No podés quitar al admin principal.");
    }

    const memberAuthUids = group.memberAuthUids.filter((authUid) => authUid !== targetAuthUid);
    const adminAuthUids = Array.from(
      new Set(group.adminAuthUids.filter((authUid) => authUid !== targetAuthUid).concat(group.ownerAuthUid))
    );

    if (adminAuthUids.length === 0) {
      throw new Error("El grupo debe tener al menos un admin.");
    }

    transaction.update(groupRef, {
      memberAuthUids,
      adminAuthUids,
      [`memberNamesByAuthUid.${targetAuthUid}`]: deleteField(),
      updatedAt: nowIso()
    });
  });
};

export const leaveGroup = async (groupId: string, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const localGroup = getLocalGroups().find((group) => group.id === groupId);
    if (!localGroup) {
      throw new Error("Grupo no encontrado.");
    }
    if (localGroup.ownerAuthUid === currentUser.id) {
      throw new Error("El admin principal no puede salir del grupo.");
    }
    const updated = leaveGroupLocal(groupId, currentUser.id);
    if (!updated) {
      throw new Error("No se pudo salir del grupo.");
    }
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  await runTransaction(cloudDb, async (transaction) => {
    const groupRef = doc(cloudDb, groupCollection, groupId);
    const groupSnapshot = await transaction.get(groupRef);
    if (!groupSnapshot.exists()) {
      throw new Error("Grupo no encontrado.");
    }
    const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
    if (group.isDeleted) {
      throw new Error("El grupo ya no está disponible.");
    }
    if (group.ownerAuthUid === actorAuthUid) {
      throw new Error("El admin principal no puede salir del grupo.");
    }
    if (!group.memberAuthUids.includes(actorAuthUid)) {
      throw new Error("No pertenecés a este grupo.");
    }

    const memberAuthUids = group.memberAuthUids.filter((authUid) => authUid !== actorAuthUid);
    const adminAuthUids = group.adminAuthUids.filter((authUid) => authUid !== actorAuthUid);

    if (adminAuthUids.length === 0) {
      throw new Error("El grupo debe tener al menos un admin.");
    }

    transaction.update(groupRef, {
      memberAuthUids,
      adminAuthUids,
      [`memberNamesByAuthUid.${actorAuthUid}`]: deleteField(),
      updatedAt: nowIso()
    });
  });
};

export const deleteGroup = async (groupId: string, currentUser: User) => {
  const cloudDb = db;
  if (!isCloudDbEnabled() || !cloudDb) {
    const localGroup = getLocalGroups().find((group) => group.id === groupId);
    if (!localGroup) {
      throw new Error("Grupo no encontrado.");
    }
    if (!isGroupAdmin(localGroup, currentUser.id)) {
      throw new Error("Solo administradores pueden eliminar el grupo.");
    }
    const deleted = deleteGroupLocal(groupId, currentUser.id);
    if (!deleted) {
      throw new Error("No se pudo eliminar el grupo.");
    }

    const reservations = getReservations();
    const next = reservations.map((reservation) =>
      reservation.groupId === groupId
        ? {
            ...reservation,
            groupId: "default-group",
            groupName: undefined,
            visibilityScope: "link_only" as const,
            updatedAt: nowIso()
          }
        : reservation
    );
    localStorage.setItem("golf-padel-reservations", JSON.stringify(next));
    window.dispatchEvent(new Event("golf-padel-store-updated"));
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  const groupRef = doc(cloudDb, groupCollection, groupId);
  const groupSnapshot = await getDoc(groupRef);
  if (!groupSnapshot.exists()) {
    throw new Error("Grupo no encontrado.");
  }
  const group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
  if (group.isDeleted) {
    return;
  }
  if (!isGroupAdmin(group, actorAuthUid)) {
    throw new Error("Solo administradores pueden eliminar el grupo.");
  }

  await setDoc(
    groupRef,
    stripUndefinedDeep({
      isDeleted: true,
      deletedAt: nowIso(),
      deletedByAuthUid: actorAuthUid,
      updatedAt: nowIso()
    }),
    { merge: true }
  );

  const reservationsSnapshot = await getDocs(
    query(collection(cloudDb, reservationCollection), where("groupId", "==", groupId))
  );
  const reservationUpdates = reservationsSnapshot.docs.map((snapshotDoc) => snapshotDoc.ref);
  await runBatchedDocUpdates(reservationUpdates, () => ({
    groupId: "default-group",
    groupName: deleteField(),
    visibilityScope: "link_only",
    updatedAt: nowIso()
  }));

  const groupInvitesSnapshot = await getDocs(
    query(collection(cloudDb, groupInviteCollection), where("groupId", "==", groupId))
  );
  const groupInviteRefs = groupInvitesSnapshot.docs
    .filter((snapshotDoc) => (snapshotDoc.data() as GroupInvite).status === "active")
    .map((snapshotDoc) => snapshotDoc.ref);
  await runBatchedDocUpdates(groupInviteRefs, () => ({
    status: "revoked",
    updatedAt: nowIso()
  }));
};

export const createReservation = async (input: ReservationInput, currentUser: User) => {
  const cloudDb = db;
  const requestedScope: ReservationVisibilityScope =
    input.visibilityScope ??
    (input.groupId && input.groupId !== "default-group" ? "group" : "link_only");

  if (!isCloudDbEnabled() || !cloudDb) {
    const actorAuthUid = currentUser.id;
    const resolved = resolveLocalVenueAndCourt(input, actorAuthUid);
    const localGroups = getLocalGroups();
    const group =
      requestedScope === "group" && input.groupId
        ? localGroups.find((candidate) => candidate.id === input.groupId) ?? null
        : null;

    if (requestedScope === "group" && !group) {
      throw new Error("Seleccioná un grupo válido.");
    }

    if (resolved.venue && group) {
      linkVenueToGroupLocal(group.id, resolved.venue.id);
    }

    createReservationLocal(
      {
        ...input,
        groupId: group?.id ?? "default-group",
        groupName: group?.name,
        visibilityScope: requestedScope,
        venueId: input.venueId ?? resolved.venue?.id,
        venueName: input.venueName ?? resolved.venue?.name,
        venueAddress: input.venueAddress ?? resolved.venue?.address,
        courtId: input.courtId ?? resolved.court?.id,
        courtName: (input.courtName?.trim() || resolved.court?.name || "Cancha a definir").trim()
      },
      currentUser
    );
    return;
  }

  const actorAuthUid = auth?.currentUser?.uid;
  if (!actorAuthUid) {
    throw new Error("Necesitás iniciar sesión.");
  }

  let group: Group | null = null;
  if (requestedScope === "group") {
    if (!input.groupId) {
      throw new Error("Seleccioná un grupo.");
    }
    const groupSnapshot = await getDoc(doc(cloudDb, groupCollection, input.groupId));
    if (!groupSnapshot.exists()) {
      throw new Error("Grupo no encontrado.");
    }
    group = normalizeGroup(groupSnapshot.id, groupSnapshot.data() as Omit<Group, "id">);
    ensureGroupMembership(group, actorAuthUid);
  }

  const { venue, court } = await resolveCloudVenueAndCourt(input, actorAuthUid);
  if (venue && group) {
    await linkVenueInCloudGroup(group.id, venue.id);
  }

  const id = crypto.randomUUID();
  const payload: Reservation = {
    id,
    groupId: group?.id ?? "default-group",
    visibilityScope: requestedScope,
    groupName: group?.name,
    venueId: input.venueId ?? venue?.id,
    venueName: input.venueName?.trim() || venue?.name,
    venueAddress: input.venueAddress?.trim() || venue?.address,
    courtId: input.courtId ?? court?.id,
    courtName: (input.courtName?.trim() || court?.name || "Cancha a definir").trim(),
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
    groupId?: string;
    groupName?: string;
    visibilityScope?: ReservationVisibilityScope;
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

    const nextVisibilityScope =
      updates.visibilityScope ?? inferReservationVisibilityScope({ ...reservation, ...updates });
    const nextGroupId =
      nextVisibilityScope === "link_only" ? "default-group" : updates.groupId ?? reservation.groupId;
    let nextGroupName = reservation.groupName;

    if (nextVisibilityScope === "group") {
      if (!nextGroupId || nextGroupId === "default-group") {
        throw new Error("Seleccioná un grupo válido.");
      }
      const targetGroupSnapshot = await transaction.get(doc(cloudDb, groupCollection, nextGroupId));
      if (!targetGroupSnapshot.exists()) {
        throw new Error("Grupo no encontrado.");
      }
      const targetGroup = normalizeGroup(targetGroupSnapshot.id, targetGroupSnapshot.data() as Omit<Group, "id">);
      ensureGroupMembership(targetGroup, actorAuthUid);
      nextGroupName = targetGroup.name;
    } else {
      nextGroupName = undefined;
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
        groupId: nextGroupId,
        groupName: nextGroupName,
        visibilityScope: nextVisibilityScope,
        updatedAt: nowIso()
      })
    );
  });
};

export const createGroupInviteLink = async (
  groupId: string,
  _currentUser: User,
  baseUrl: string,
  channel: GroupInvite["channel"] = "link"
): Promise<string> => {
  const cloudDb = db;
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (!isCloudDbEnabled() || !cloudDb) {
    throw new Error("Las invitaciones por link requieren sincronización activa.");
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
  if (group.isDeleted) {
    throw new Error("El grupo ya no está disponible.");
  }
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
    channel
  };
  await setDoc(doc(cloudDb, groupInviteCollection, token), stripUndefinedDeep(invite));
  return `${normalizedBase}/join/${token}`;
};

export const createReservationInviteLink = async (
  reservationId: string,
  _currentUser: User,
  baseUrl: string,
  channel: ReservationInvite["channel"] = "link"
): Promise<string> => {
  const cloudDb = db;
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (!isCloudDbEnabled() || !cloudDb) {
    throw new Error("Las invitaciones por link requieren sincronización activa.");
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
    channel
  };
  await setDoc(doc(cloudDb, reservationInviteCollection, token), stripUndefinedDeep(invite));
  return `${normalizedBase}/join/${token}`;
};

const acceptInviteTokenCloudFallback = async (
  cloudDb: NonNullable<typeof db>,
  token: string,
  currentUser: User
): Promise<{ type: "group" | "reservation"; groupId: string; reservationId?: string }> => {
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
      if (group.isDeleted) {
        throw new Error("Este grupo ya no está disponible.");
      }
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

  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error("Necesitás iniciar sesión.");
  }

  let apiErrorMessage: string | null = null;
  try {
    const response = await fetch("/api/invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({
        token,
        displayName: currentUser.name
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; type?: "group" | "reservation"; groupId?: string; reservationId?: string }
      | null;

    if (response.ok && payload?.type && payload.groupId) {
      return {
        type: payload.type,
        groupId: payload.groupId,
        reservationId: payload.reservationId
      };
    }

    apiErrorMessage = payload?.error ?? "No se pudo aceptar la invitación.";
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (!/Failed to fetch/i.test(message)) {
      apiErrorMessage = message || apiErrorMessage;
    }
  }

  try {
    return await acceptInviteTokenCloudFallback(cloudDb, token, currentUser);
  } catch (fallbackError) {
    if (apiErrorMessage) {
      throw new Error(apiErrorMessage);
    }
    throw fallbackError;
  }
};
