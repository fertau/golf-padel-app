import type { Reservation, User } from "../lib/types";
import { calculateSignupResult, formatDateTime } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  onOpen: (id: string) => void;
};

export default function ReservationCard({ reservation, currentUser, onOpen }: Props) {
  const { titulares, suplentes } = calculateSignupResult(reservation);
  const joined = reservation.signups.some(
    (signup) => signup.userId === currentUser.id && signup.active
  );

  return (
    <button className="reservation-card" onClick={() => onOpen(reservation.id)}>
      <div className="reservation-card-top">
        <strong>{reservation.courtName}</strong>
        <span className="reservation-date">{formatDateTime(reservation.startDateTime)}</span>
      </div>

      <div className="meta">
        <span className="meta-pill">Titulares {titulares.length}</span>
        <span className="meta-pill">Suplentes {suplentes.length}</span>
        {joined ? <span className="tag">Anotado</span> : null}
        {reservation.status === "cancelled" ? <span className="tag danger">Cancelada</span> : null}
      </div>
    </button>
  );
}
