import type { Reservation, User } from "../lib/types";
import { formatDateTime, getSignupsByStatus, getUserAttendance } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  onOpen: (id: string) => void;
  isExpanded: boolean;
};

export default function ReservationCard({ reservation, currentUser, onOpen, isExpanded }: Props) {
  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const mine = getUserAttendance(reservation, currentUser.id);

  return (
    <button
      className={`reservation-card ${isExpanded ? "expanded" : ""}`}
      onClick={() => onOpen(reservation.id)}
    >
      <div className="reservation-card-top">
        <span className="reservation-date">{formatDateTime(reservation.startDateTime)}</span>
        <strong className="text-dynamic">{reservation.courtName}</strong>
      </div>
      <div className="meta">
        <span className="meta-pill">{confirmed.length}/4 Jugadores</span>
        {mine && (
          <span className={`status-chip status-chip-mine chip-mine-${mine.attendanceStatus}`}>
            {mine.attendanceStatus === "confirmed" ? "Juego" : mine.attendanceStatus === "maybe" ? "Duda" : "Fuera"}
          </span>
        )}
      </div>
    </button>
  );
}
