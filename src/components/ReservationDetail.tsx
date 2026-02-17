import type { AttendanceStatus, Reservation, User } from "../lib/types";
import {
  buildWhatsAppMessage,
  canJoinReservation,
  formatDateTime,
  getSignupsByStatus,
  getUserAttendance
} from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  appUrl: string;
  onSetAttendanceStatus: (reservationId: string, status: AttendanceStatus) => void;
  onCancel: (reservationId: string) => void;
};

export default function ReservationDetail({
  reservation,
  currentUser,
  appUrl,
  onSetAttendanceStatus,
  onCancel
}: Props) {
  const isCreator = reservation.createdBy.id === currentUser.id;
  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const maybe = getSignupsByStatus(reservation, "maybe");
  const myAttendance = getUserAttendance(reservation, currentUser.id);

  const eligibility = canJoinReservation(reservation, currentUser);

  const message = buildWhatsAppMessage(reservation, appUrl);

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Reserva de padel", text: message });
      return;
    }
    await navigator.clipboard.writeText(message);
    alert("Mensaje copiado");
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    alert("Mensaje copiado");
  };

  const openWhatsApp = () => {
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="panel panel-detail">
      <h2>{reservation.courtName}</h2>
      <p>{formatDateTime(reservation.startDateTime)}</p>
      <p>Duración: {reservation.durationMinutes} minutos</p>
      <p>Creador: {reservation.createdBy.name}</p>

      <div className="actions">
        <button
          onClick={() => onSetAttendanceStatus(reservation.id, "confirmed")}
          disabled={myAttendance?.attendanceStatus === "confirmed"}
        >
          Confirmar
        </button>
        <button
          onClick={() => onSetAttendanceStatus(reservation.id, "maybe")}
          disabled={myAttendance?.attendanceStatus === "maybe" || (!myAttendance && !eligibility.ok)}
        >
          Quizás
        </button>
        <button
          onClick={() => onSetAttendanceStatus(reservation.id, "cancelled")}
          disabled={!myAttendance}
        >
          Cancelar confirmación
        </button>
      </div>

      {!eligibility.ok && !myAttendance ? <p className="warning">{eligibility.reason}</p> : null}

      <div className="list-grid">
        <div>
          <h3>Confirmados</h3>
          {confirmed.length === 0 ? <p className="private-hint">Sin confirmados por ahora.</p> : null}
          <ul>
            {confirmed.map((signup) => (
              <li key={signup.id}>{signup.userName}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Quizás</h3>
          {maybe.length === 0 ? <p className="private-hint">Sin jugadores en quizás.</p> : null}
          <ul>
            {maybe.map((signup) => (
              <li key={signup.id}>{signup.userName}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="actions">
        <button onClick={openWhatsApp}>Abrir WhatsApp</button>
        <button onClick={share}>Compartir</button>
        <button onClick={copyMessage}>Copiar mensaje</button>
      </div>

      {isCreator ? (
        <div className="actions">
          <button className="danger" onClick={() => onCancel(reservation.id)}>
            Cancelar reserva
          </button>
        </div>
      ) : null}
    </section>
  );
}
