export type Role = "TITULAR" | "SUPLENTE";

export type User = {
  id: string;
  name: string;
  avatar?: string;
};

export type PlayerVisibility = "public" | "private";

export type Player = {
  id: string;
  name: string;
  avatar: string;
  usernameNormalized: string;
  ownerId: string;
  createdAt: string;
  isPinned: boolean;
  visibility: PlayerVisibility;
  isAdmin: boolean;
  stats: Record<string, number>;
  derivedStats: Record<string, number>;
  friends: string[];
  friendRequests: string[];
  sentRequests: string[];
};

export type ReservationRules = {
  maxPlayersAccepted: number;
  priorityUserIds: string[];
  allowWaitlist: boolean;
  signupDeadline?: string;
};

export type AttendanceStatus = "confirmed" | "maybe" | "cancelled";
export type ReservationVisibilityScope = "group" | "link_only";

export type GroupRole = "owner" | "admin" | "member";

export type Group = {
  id: string;
  name: string;
  ownerAuthUid: string;
  memberAuthUids: string[];
  adminAuthUids: string[];
  memberNamesByAuthUid: Record<string, string>;
  venueIds: string[];
  isDeleted?: boolean;
  deletedAt?: string;
  deletedByAuthUid?: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupAuditEventType =
  | "member_joined"
  | "member_removed"
  | "admin_granted"
  | "admin_revoked"
  | "group_renamed"
  | "reservation_owner_reassigned";

export type GroupAuditEvent = {
  id: string;
  groupId: string;
  type: GroupAuditEventType;
  actorAuthUid: string;
  actorName: string;
  targetAuthUid?: string;
  targetName?: string;
  metadata?: Record<string, string>;
  createdAt: string;
};

export type Venue = {
  id: string;
  name: string;
  address: string;
  googlePlaceId?: string;
  mapsUrl?: string;
  createdByAuthUid: string;
  createdAt: string;
  updatedAt: string;
};

export type Court = {
  id: string;
  venueId: string;
  name: string;
  createdByAuthUid: string;
  createdAt: string;
  updatedAt: string;
};

export type InviteTargetType = "group" | "reservation";
export type InviteChannel = "whatsapp" | "email" | "link";
export type InviteStatus = "active" | "revoked";

export type InviteBase = {
  token: string;
  targetType: InviteTargetType;
  createdByAuthUid: string;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
  channel: InviteChannel;
};

export type GroupInvite = InviteBase & {
  targetType: "group";
  groupId: string;
};

export type ReservationInvite = InviteBase & {
  targetType: "reservation";
  groupId: string;
  reservationId: string;
};

export type Signup = {
  id: string;
  reservationId: string;
  userId: string;
  authUid?: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
  attendanceStatus: AttendanceStatus;
};

export type Reservation = {
  id: string;
  groupId: string;
  visibilityScope?: ReservationVisibilityScope;
  groupName?: string;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  courtId?: string;
  courtName: string;
  startDateTime: string;
  durationMinutes: number;
  createdBy: User;
  createdByAuthUid?: string;
  guestAccessUids?: string[];
  rules: ReservationRules;
  signups: Signup[];
  status: "active" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type SignupResult = {
  titulares: Signup[];
  suplentes: Signup[];
};
