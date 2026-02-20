import type {
  Court,
  Group,
  GroupInvite,
  GroupRole,
  ReservationInvite,
  User,
  Venue
} from "./types";

const GROUPS_KEY = "golf-padel-groups";
const VENUES_KEY = "golf-padel-venues";
const COURTS_KEY = "golf-padel-courts";
const INVITES_KEY = "golf-padel-invites";
const STORE_EVENT = "golf-padel-groups-store-updated";

type InviteRecord = GroupInvite | ReservationInvite;

const nowIso = () => new Date().toISOString();
const inviteExpirationIso = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const read = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const write = <T>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORE_EVENT));
};

const getInviteStore = (): Record<string, InviteRecord> => read<Record<string, InviteRecord>>(INVITES_KEY, {});

const normalizeLocalGroup = (group: Group): Group => ({
  ...group,
  memberAuthUids: group.memberAuthUids ?? [],
  adminAuthUids: group.adminAuthUids ?? [],
  memberNamesByAuthUid: group.memberNamesByAuthUid ?? {},
  venueIds: group.venueIds ?? [],
  isDeleted: group.isDeleted === true
});

export const getLocalGroups = (): Group[] => read<Group[]>(GROUPS_KEY, []).map(normalizeLocalGroup);
export const getLocalVenues = (): Venue[] => read<Venue[]>(VENUES_KEY, []);
export const getLocalCourts = (): Court[] => read<Court[]>(COURTS_KEY, []);

export const subscribeLocalGroupsForUser = (
  authUid: string,
  onChange: (groups: Group[]) => void
) => {
  const handler = () => {
    const groups = getLocalGroups()
      .filter((group) => !group.isDeleted && group.memberAuthUids.includes(authUid))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    onChange(groups);
  };
  window.addEventListener(STORE_EVENT, handler);
  window.addEventListener("storage", handler);
  handler();
  return () => {
    window.removeEventListener(STORE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};

export const subscribeLocalVenues = (onChange: (venues: Venue[]) => void) => {
  const handler = () => {
    const venues = getLocalVenues().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    onChange(venues);
  };
  window.addEventListener(STORE_EVENT, handler);
  window.addEventListener("storage", handler);
  handler();
  return () => {
    window.removeEventListener(STORE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};

export const subscribeLocalCourts = (onChange: (courts: Court[]) => void) => {
  const handler = () => {
    const courts = getLocalCourts().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    onChange(courts);
  };
  window.addEventListener(STORE_EVENT, handler);
  window.addEventListener("storage", handler);
  handler();
  return () => {
    window.removeEventListener(STORE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};

export const createGroupLocal = (name: string, user: User): Group => {
  const groups = getLocalGroups();
  const timestamp = nowIso();
  const group: Group = {
    id: crypto.randomUUID(),
    name: name.trim(),
    ownerAuthUid: user.id,
    memberAuthUids: [user.id],
    adminAuthUids: [user.id],
    memberNamesByAuthUid: { [user.id]: user.name },
    venueIds: [],
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  write(GROUPS_KEY, [...groups, group]);
  return group;
};

export const renameGroupLocal = (groupId: string, name: string): Group | null => {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const groups = getLocalGroups();
  let nextGroup: Group | null = null;
  const next = groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }
    if (group.isDeleted) {
      return group;
    }
    nextGroup = {
      ...group,
      name: trimmed,
      updatedAt: nowIso()
    };
    return nextGroup;
  });
  write(GROUPS_KEY, next);
  return nextGroup;
};

export const ensureDefaultGroupLocal = (user: User): Group => {
  const groups = getLocalGroups();
  const existing = groups.find((group) => !group.isDeleted && group.memberAuthUids.includes(user.id));
  if (existing) {
    if (existing.adminAuthUids.includes(user.id)) {
      return existing;
    }
    const updated = {
      ...existing,
      adminAuthUids: Array.from(new Set([...existing.adminAuthUids, user.id])),
      updatedAt: nowIso()
    };
    write(
      GROUPS_KEY,
      groups.map((group) => (group.id === existing.id ? updated : group))
    );
    return updated;
  }
  return createGroupLocal("Mi grupo", user);
};

export const addGroupMemberLocal = (
  groupId: string,
  user: User,
  role: GroupRole = "member"
): Group | null => {
  const groups = getLocalGroups();
  let nextGroup: Group | null = null;
  const next = groups.map((group) => {
    if (group.id !== groupId) return group;
    if (group.isDeleted) return group;
    const memberAuthUids = group.memberAuthUids.includes(user.id)
      ? group.memberAuthUids
      : [...group.memberAuthUids, user.id];
    const adminAuthUids =
      role === "admin" || role === "owner"
        ? Array.from(new Set([...group.adminAuthUids, user.id]))
        : group.adminAuthUids;
    nextGroup = {
      ...group,
      memberAuthUids,
      adminAuthUids,
      memberNamesByAuthUid: {
        ...group.memberNamesByAuthUid,
        [user.id]: user.name
      },
      updatedAt: nowIso()
    };
    return nextGroup;
  });
  write(GROUPS_KEY, next);
  return nextGroup;
};

export const setGroupMemberAdminLocal = (
  groupId: string,
  targetAuthUid: string,
  makeAdmin: boolean
): Group | null => {
  const groups = getLocalGroups();
  let nextGroup: Group | null = null;
  const next = groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }
    if (group.isDeleted) {
      return group;
    }
    if (!group.memberAuthUids.includes(targetAuthUid)) {
      return group;
    }
    if (group.ownerAuthUid === targetAuthUid) {
      return group;
    }

    const adminAuthUids = makeAdmin
      ? Array.from(new Set([...group.adminAuthUids, targetAuthUid]))
      : group.adminAuthUids.filter((authUid) => authUid !== targetAuthUid);

    nextGroup = {
      ...group,
      adminAuthUids,
      updatedAt: nowIso()
    };
    return nextGroup;
  });
  write(GROUPS_KEY, next);
  return nextGroup;
};

export const removeGroupMemberLocal = (groupId: string, targetAuthUid: string): Group | null => {
  const groups = getLocalGroups();
  let nextGroup: Group | null = null;
  const next = groups.map((group) => {
    if (group.id !== groupId) return group;
    if (group.isDeleted) return group;
    if (group.ownerAuthUid === targetAuthUid) return group;
    if (!group.memberAuthUids.includes(targetAuthUid)) return group;

    const memberAuthUids = group.memberAuthUids.filter((authUid) => authUid !== targetAuthUid);
    const adminAuthUids = group.adminAuthUids.filter((authUid) => authUid !== targetAuthUid);

    if (adminAuthUids.length === 0) {
      return group;
    }

    const memberNamesByAuthUid = { ...group.memberNamesByAuthUid };
    delete memberNamesByAuthUid[targetAuthUid];

    nextGroup = {
      ...group,
      memberAuthUids,
      adminAuthUids,
      memberNamesByAuthUid,
      updatedAt: nowIso()
    };
    return nextGroup;
  });
  write(GROUPS_KEY, next);
  return nextGroup;
};

export const leaveGroupLocal = (groupId: string, authUid: string): Group | null => {
  const groups = getLocalGroups();
  let nextGroup: Group | null = null;
  const next = groups.map((group) => {
    if (group.id !== groupId) return group;
    if (group.isDeleted) return group;
    if (group.ownerAuthUid === authUid) return group;
    if (!group.memberAuthUids.includes(authUid)) return group;

    const memberAuthUids = group.memberAuthUids.filter((uid) => uid !== authUid);
    const adminAuthUids = group.adminAuthUids.filter((uid) => uid !== authUid);

    if (adminAuthUids.length === 0) {
      return group;
    }

    const memberNamesByAuthUid = { ...group.memberNamesByAuthUid };
    delete memberNamesByAuthUid[authUid];

    nextGroup = {
      ...group,
      memberAuthUids,
      adminAuthUids,
      memberNamesByAuthUid,
      updatedAt: nowIso()
    };
    return nextGroup;
  });
  write(GROUPS_KEY, next);
  return nextGroup;
};

export const deleteGroupLocal = (groupId: string, deletedByAuthUid: string): Group | null => {
  const groups = getLocalGroups();
  let nextGroup: Group | null = null;
  const next = groups.map((group) => {
    if (group.id !== groupId) return group;
    if (group.isDeleted) return group;
    nextGroup = {
      ...group,
      isDeleted: true,
      deletedAt: nowIso(),
      deletedByAuthUid,
      updatedAt: nowIso()
    };
    return nextGroup;
  });
  write(GROUPS_KEY, next);
  return nextGroup;
};

export const createVenueLocal = (
  input: { name: string; address: string; googlePlaceId?: string; mapsUrl?: string },
  authUid: string
): Venue => {
  const venues = getLocalVenues();
  const timestamp = nowIso();
  const venue: Venue = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    address: input.address.trim(),
    googlePlaceId: input.googlePlaceId,
    mapsUrl: input.mapsUrl,
    createdByAuthUid: authUid,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  write(VENUES_KEY, [...venues, venue]);
  return venue;
};

export const createCourtLocal = (venueId: string, name: string, authUid: string): Court => {
  const courts = getLocalCourts();
  const timestamp = nowIso();
  const court: Court = {
    id: crypto.randomUUID(),
    venueId,
    name: name.trim(),
    createdByAuthUid: authUid,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  write(COURTS_KEY, [...courts, court]);
  return court;
};

export const linkVenueToGroupLocal = (groupId: string, venueId: string) => {
  const groups = getLocalGroups();
  const next = groups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          venueIds: group.venueIds.includes(venueId) ? group.venueIds : [...group.venueIds, venueId],
          updatedAt: nowIso()
        }
      : group
  );
  write(GROUPS_KEY, next);
};

export const createGroupInviteLocal = (
  groupId: string,
  createdByAuthUid: string,
  channel: GroupInvite["channel"]
): GroupInvite => {
  const token = crypto.randomUUID();
  const invite: GroupInvite = {
    token,
    targetType: "group",
    groupId,
    createdByAuthUid,
    createdAt: nowIso(),
    expiresAt: inviteExpirationIso(),
    status: "active",
    channel
  };
  const invites = getInviteStore();
  invites[token] = invite;
  write(INVITES_KEY, invites);
  return invite;
};

export const createReservationInviteLocal = (
  groupId: string,
  reservationId: string,
  createdByAuthUid: string,
  channel: ReservationInvite["channel"]
): ReservationInvite => {
  const token = crypto.randomUUID();
  const invite: ReservationInvite = {
    token,
    targetType: "reservation",
    groupId,
    reservationId,
    createdByAuthUid,
    createdAt: nowIso(),
    expiresAt: inviteExpirationIso(),
    status: "active",
    channel
  };
  const invites = getInviteStore();
  invites[token] = invite;
  write(INVITES_KEY, invites);
  return invite;
};

export const getInviteByTokenLocal = (token: string): InviteRecord | null => {
  const invites = getInviteStore();
  return invites[token] ?? null;
};
