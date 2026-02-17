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
  const IconWhatsApp = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.3A8.7 8.7 0 0 0 4.5 16l-1.2 4.7L8 19.4A8.7 8.7 0 1 0 12 3.3Zm0 15.9a7.2 7.2 0 0 1-3.7-1L8 18l-2.6.7.7-2.5-.2-.4a7.2 7.2 0 1 1 6.1 3.4Zm4-5.4c-.2-.1-1.1-.6-1.3-.6s-.3-.1-.4.1c-.1.2-.5.6-.6.7-.1.1-.2.2-.4.1a5.9 5.9 0 0 1-1.7-1.1 6.4 6.4 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.3.2-.3v-.3c0-.1-.4-1-.6-1.4-.2-.4-.3-.3-.4-.3h-.4c-.1 0-.3 0-.4.2-.1.2-.6.6-.6 1.4s.6 1.5.7 1.6c.1.1 1.2 2 2.9 2.8 1.7.7 1.7.5 2 .5.3 0 1.1-.4 1.3-.8.2-.4.2-.7.1-.8Z"
        fill="currentColor"
      />
    </svg>
  );
  const IconShare = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.5v10.2m0-10.2 3.2 3.1M12 3.5 8.8 6.6M5.2 11v6.6c0 .9.7 1.6 1.6 1.6h10.4c.9 0 1.6-.7 1.6-1.6V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const IconCopy = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.2 7.2h8.1c.8 0 1.5.7 1.5 1.5v8.1c0 .8-.7 1.5-1.5 1.5H9.2c-.8 0-1.5-.7-1.5-1.5V8.7c0-.8.7-1.5 1.5-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5.2 14.8V6.7c0-.8.7-1.5 1.5-1.5h8.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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
      <div className="detail-title-row">
        <h3>Detalle del partido</h3>
        <span className="meta-pill">{reservation.durationMinutes} min</span>
      </div>
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span>Cancha</span>
          <strong>{reservation.courtName}</strong>
        </div>
        <div className="detail-meta-item">
          <span>Fecha y hora</span>
          <strong>{formatDateTime(reservation.startDateTime)}</strong>
        </div>
        <div className="detail-meta-item">
          <span>Reservó</span>
          <strong>{reservation.createdBy.name}</strong>
        </div>
      </div>
      <div className="my-status-row">
        <span className="kpi-label">Mi respuesta</span>
        <strong>
          {myAttendance?.attendanceStatus === "confirmed"
            ? "Juego"
            : myAttendance?.attendanceStatus === "maybe"
              ? "Quizás"
              : myAttendance?.attendanceStatus === "cancelled"
                ? "No juego"
                : "Sin responder"}
        </strong>
      </div>

      <div className="actions">
        <button
          className="success"
          onClick={() => onSetAttendanceStatus(reservation.id, "confirmed")}
          disabled={myAttendance?.attendanceStatus === "confirmed"}
        >
          Confirmá
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
          disabled={myAttendance?.attendanceStatus === "cancelled"}
        >
          No juego
        </button>
      </div>

      {!eligibility.ok && !myAttendance ? <p className="warning">{eligibility.reason}</p> : null}

      <div className="players-board">
        <div className="player-list-card">
          <div className="player-list-head">
            <h3>Confirmados</h3>
            <span className="meta-pill">{confirmed.length}</span>
          </div>
          {confirmed.length === 0 ? <p className="private-hint">Sin confirmados por ahora.</p> : null}
          <div className="player-list">
            {confirmed.map((signup, index) => (
              <div key={signup.id} className="player-row">
                <span className="player-index">{index + 1}</span>
                <span className="player-name">{signup.userName}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="player-list-card">
          <div className="player-list-head">
            <h3>Quizás</h3>
            <span className="meta-pill">{maybe.length}</span>
          </div>
          {maybe.length === 0 ? <p className="private-hint">Sin jugadores en quizás.</p> : null}
          <div className="player-list">
            {maybe.map((signup, index) => (
              <div key={signup.id} className="player-row">
                <span className="player-index">{index + 1}</span>
                <span className="player-name">{signup.userName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="actions actions-share">
        <button className="action-ghost" onClick={openWhatsApp}>
          <span className="button-icon" aria-hidden="true">{IconWhatsApp}</span>
          Whatsapp
        </button>
        <button className="action-ghost" onClick={share}>
          <span className="button-icon" aria-hidden="true">{IconShare}</span>
          Compartir
        </button>
        <button className="action-ghost" onClick={copyMessage}>
          <span className="button-icon" aria-hidden="true">{IconCopy}</span>
          Copiar mensaje
        </button>
      </div>

      {isCreator ? (
        <div className="danger-zone">
          <div className="actions danger-actions">
            <button type="button" className="danger-outline" onClick={() => setEditing((value) => !value)}>
              {editing ? "Cancelar edición" : "Modificar reserva"}
            </button>
            <button className="danger" onClick={() => onCancel(reservation.id)}>
              Cancelar reserva
            </button>
          </div>
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
