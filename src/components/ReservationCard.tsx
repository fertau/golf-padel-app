import type { Reservation, User } from "../lib/types";
import { formatDateTime, getActiveSignups } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  onOpen: (id: string) => void;
};

export default function ReservationCard({ reservation, currentUser, onOpen }: Props) {
  const players = getActiveSignups(reservation);
  const joined = players.some((signup) => signup.userId === currentUser.id);

  return (
    <button className="reservation-card" onClick={() => onOpen(reservation.id)}>
      <div className="reservation-card-top">
        <strong>{reservation.courtName}</strong>
        <span className="reservation-date">{formatDateTime(reservation.startDateTime)}</span>
      </div>

      <div className="meta">
        <span className="meta-pill">Jugadores {players.length}</span>
        {joined ? <span className="tag">Anotado</span> : null}
        {reservation.status === "cancelled" ? <span className="tag danger">Cancelada</span> : null}
      </div>
    </button>
  );
}
