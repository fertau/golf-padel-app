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
    <button className="reservation-card" onClick={() => onOpen(reservation.id)}>
      <div className="reservation-card-top">
        <strong>{reservation.courtName}</strong>
        <span className="reservation-date">{formatDateTime(reservation.startDateTime)}</span>
      </div>

      <div className="meta">
        <span className="meta-pill">Confirmados {confirmed.length}</span>
        <span className="meta-pill">Quizás {maybe.length}</span>
        {mine ? <span className="tag">Mi estado: {mine.attendanceStatus === "confirmed" ? "Confirmado" : "Quizás"}</span> : null}
        {reservation.status === "cancelled" ? <span className="tag danger">Cancelada</span> : null}
        <span className="meta-pill">{isExpanded ? "Ocultar detalle" : "Ver detalle"}</span>
      </div>
    </button>
  );
}
