export type Role = "TITULAR" | "SUPLENTE";

export type User = {
  id: string;
  name: string;
};

export type ReservationRules = {
  maxPlayersAccepted: number;
  priorityUserIds: string[];
  allowWaitlist: boolean;
  signupDeadline?: string;
};

export type Signup = {
  id: string;
  reservationId: string;
  userId: string;
  userName: string;
  createdAt: string;
  active: boolean;
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
