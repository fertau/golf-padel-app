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
  const maybe = getSignupsByStatus(reservation, "maybe");
  const mine = getUserAttendance(reservation, currentUser.id);

  return (
    <button
      className={`reservation-card ${isExpanded ? "expanded" : ""}`}
      onClick={() => onOpen(reservation.id)}
    >
      <div className="reservation-card-top">
        <strong className="text-dynamic">{reservation.courtName}</strong>
        <span className="reservation-date">{formatDateTime(reservation.startDateTime)}</span>
      </div>

      <div className="meta">
        <span className="status-chip chip-confirmed">Confirmados {confirmed.length}</span>
        <span className="status-chip chip-waiting">Faltan jugadores {maybe.length}</span>
        {mine ? (
          <span
            className={`status-chip status-chip-mine ${
              mine.attendanceStatus === "confirmed"
                ? "chip-mine-confirmed"
                : mine.attendanceStatus === "maybe"
                  ? "chip-mine-maybe"
                  : "chip-mine-cancelled"
            }`}
          >
            {mine.attendanceStatus === "confirmed"
              ? "Ya confirmé"
              : mine.attendanceStatus === "maybe"
                ? "En duda"
                : "No juego"}
          </span>
        ) : null}
        {reservation.status === "cancelled" ? <span className="status-chip chip-cancelled">Cancelada</span> : null}
        <span className="meta-pill">{isExpanded ? "Cerrar detalle" : "Ver detalle"}</span>
      </div>
    </button>
  );
}
