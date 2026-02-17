export type Role = "TITULAR" | "SUPLENTE";

export type User = {
  id: string;
  name: string;
};

export type PlayerVisibility = "public" | "private";

export type Player = {
  id: string;
  name: string;
  avatar: string;
  pin: string;
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

export type Signup = {
  id: string;
  reservationId: string;
  userId: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
  attendanceStatus: AttendanceStatus;
};

export type Reservation = {
  id: string;
  courtName: string;
  startDateTime: string;
  durationMinutes: number;
  createdBy: User;
  screenshotUrl?: string;
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
