import { useState } from "react";
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
  onUpdateReservation: (
    reservationId: string,
    updates: { courtName: string; startDateTime: string; durationMinutes: number }
  ) => void;
};

export default function ReservationDetail({
  reservation,
  currentUser,
  appUrl,
  onSetAttendanceStatus,
  onCancel,
  onUpdateReservation
}: Props) {
  const isCreator = reservation.createdBy.id === currentUser.id;
  const [editing, setEditing] = useState(false);
  const [editCourtName, setEditCourtName] = useState(reservation.courtName);
  const [editStartDateTime, setEditStartDateTime] = useState(
    reservation.startDateTime.slice(0, 16)
  );
  const [editDuration, setEditDuration] = useState(reservation.durationMinutes);
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

  const submitEdit = () => {
    onUpdateReservation(reservation.id, {
      courtName: editCourtName,
      startDateTime: editStartDateTime,
      durationMinutes: editDuration
    });
    setEditing(false);
  };

  return (
    <section className="panel panel-detail">
      <h2>{reservation.courtName}</h2>
      <p>{formatDateTime(reservation.startDateTime)}</p>
      <p>Duración: {reservation.durationMinutes} minutos</p>
      <p>Creador: {reservation.createdBy.name}</p>

      <div className="actions">
        <button
          className="success"
          onClick={() => onSetAttendanceStatus(reservation.id, "confirmed")}
          disabled={myAttendance?.attendanceStatus === "confirmed"}
        >
          Juego
        </button>
        <button
          className="neutral"
          onClick={() => onSetAttendanceStatus(reservation.id, "maybe")}
          disabled={myAttendance?.attendanceStatus === "maybe" || (!myAttendance && !eligibility.ok)}
        >
          Quizás
        </button>
        <button
          className="danger"
          onClick={() => onSetAttendanceStatus(reservation.id, "cancelled")}
          disabled={!myAttendance}
        >
          No juego
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
          <button type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Cancelar edición" : "Modificar reserva"}
          </button>
          <button className="danger" onClick={() => onCancel(reservation.id)}>
            Cancelar reserva
          </button>
        </div>
      ) : null}

      {isCreator && editing ? (
        <div className="panel account-panel">
          <label>
            Cancha
            <select value={editCourtName} onChange={(event) => setEditCourtName(event.target.value)}>
              <option value="Cancha 1">Cancha 1</option>
              <option value="Cancha 2">Cancha 2</option>
            </select>
          </label>
          <label>
            Fecha y hora
            <input
              type="datetime-local"
              value={editStartDateTime}
              onChange={(event) => setEditStartDateTime(event.target.value)}
            />
          </label>
          <label>
            Duración
            <select
              value={editDuration}
              onChange={(event) => setEditDuration(Number(event.target.value))}
            >
              <option value={60}>60 minutos</option>
              <option value={90}>90 minutos</option>
              <option value={120}>120 minutos</option>
            </select>
          </label>
          <button type="button" onClick={submitEdit}>
            Guardar cambios
          </button>
        </div>
      ) : null}
    </section>
  );
}
