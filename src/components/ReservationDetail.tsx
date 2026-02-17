import { useState } from "react";
import type { AttendanceStatus, Reservation, User, Signup } from "../lib/types";
import {
  buildWhatsAppMessage,
  canJoinReservation,
  getSignupsByStatus,
  getUserAttendance,
  isGenericDisplayName,
  isReservationCreator,
  triggerHaptic
} from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  appUrl: string;
  signupNameByAuthUid: Record<string, string>;
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
  signupNameByAuthUid,
  onSetAttendanceStatus,
  onCancel,
  onUpdateReservation
}: Props) {
  const toIcsDate = (date: Date): string => {
    const pad = (value: number) => `${value}`.padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  };

  const startDate = new Date(reservation.startDateTime);
  const endDate = new Date(startDate.getTime() + reservation.durationMinutes * 60 * 1000);
  const reservationUrl = `${appUrl}/r/${reservation.id}`;
  const message = buildWhatsAppMessage(reservation, appUrl);

  const handleSetAttendance = (status: AttendanceStatus) => {
    onSetAttendanceStatus(reservation.id, status);
    triggerHaptic("light");
  };

  const openGoogleCalendar = () => {
    triggerHaptic("light");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Pádel - ${reservation.courtName}`,
      dates: `${toIcsDate(startDate)}/${toIcsDate(endDate)}`,
      details: `Reserva creada por ${reservation.createdBy.name}. ${reservationUrl}`
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  const openWhatsApp = () => {
    triggerHaptic("light");
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank", "noopener,noreferrer");
  };

  const share = async () => {
    triggerHaptic("light");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Reserva de padel", text: message });
        return;
      } catch (e) {
        // Fallback
      }
    }
    await navigator.clipboard.writeText(message);
    alert("Mensaje copiado");
  };

  const isCreator = isReservationCreator(reservation, currentUser.id);
  const [editing, setEditing] = useState(false);
  const [editCourtName, setEditCourtName] = useState(reservation.courtName);
  const [editStartDateTime, setEditStartDateTime] = useState(reservation.startDateTime.slice(0, 16));
  const [editDuration, setEditDuration] = useState(reservation.durationMinutes);

  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const maybe = getSignupsByStatus(reservation, "maybe");
  const cancelled = getSignupsByStatus(reservation, "cancelled");
  const myAttendance = getUserAttendance(reservation, currentUser.id);

  const formatDateTime = (iso: string): string => {
    const date = new Date(iso);
    return date.toLocaleString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const eligibility = canJoinReservation(reservation, currentUser);

  const submitEdit = () => {
    onUpdateReservation(reservation.id, {
      courtName: editCourtName,
      startDateTime: editStartDateTime,
      durationMinutes: editDuration
    });
    setEditing(false);
    triggerHaptic("medium");
  };

  const renderPlayerList = (list: Signup[], label: string, isOpen = false) => (
    <details className="player-collapse" open={isOpen}>
      <summary>{label} <strong>{list.length}</strong></summary>
      <div className="player-list compact">
        {list.length === 0 ? <p className="private-hint">Sin registros aún.</p> : null}
        {list.map((signup) => (
          <div key={signup.id} className="player-row compact">
            <div className="player-avatar-mini">{formatSignupName(signup).charAt(0)}</div>
            <span className="player-name">{formatSignupName(signup)}</span>
          </div>
        ))}
      </div>
    </details>
  );

  const formatSignupName = (signup: Signup): string => {
    if (!isGenericDisplayName(signup.userName)) {
      return signup.userName;
    }
    if (signup.authUid && signupNameByAuthUid[signup.authUid]) {
      return signupNameByAuthUid[signup.authUid];
    }
    const suffixSource = signup.authUid || signup.userId || signup.id;
    return `Jugador #${suffixSource.slice(-4).toUpperCase()}`;
  };

  return (
    <div className="list">
      <div className="panel panel-detail">
        <div className="detail-title-row">
          <h3>Detalles</h3>
          {isCreator && (
            <button className="neutral" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setEditing(!editing)}>
              {editing ? "Cerrar" : "Modificar"}
            </button>
          )}
        </div>

        <div className="detail-meta-grid">
          <div className="detail-meta-item">
            <span>Cancha</span>
            <strong>{reservation.courtName}</strong>
          </div>
          <div className="detail-meta-item">
            <span>Fecha</span>
            <small>{formatDateTime(reservation.startDateTime)}</small>
          </div>
          <div className="detail-meta-item">
            <span>Lugar</span>
            {confirmed.length >= 4 ? <strong className="danger">LLENO</strong> : <strong className="success">DISPONIBLE</strong>}
          </div>
        </div>

        <div className="detail-kpis">
          <div className="kpi-card">
            <span className="kpi-label">Confirmados</span>
            <strong>{confirmed.length}/4</strong>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Duda</span>
            <strong>{maybe.length}</strong>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Fuera</span>
            <strong>{cancelled.length}</strong>
          </div>
        </div>

        <div className="actions-calendar">
          <button className="neutral action-ghost" onClick={openGoogleCalendar}>
            Google Calendar
          </button>
        </div>
      </div>

      <div className="panel">
        <h3 className="section-title">Tu asistencia</h3>
        <div className="choice-row">
          <button
            className={`attendance-btn ${myAttendance?.attendanceStatus === "confirmed" ? "active" : ""}`}
            onClick={() => handleSetAttendance("confirmed")}
          >
            Juego
          </button>
          <button
            className={`attendance-btn ${myAttendance?.attendanceStatus === "maybe" ? "active" : ""}`}
            onClick={() => handleSetAttendance("maybe")}
            disabled={!myAttendance && !eligibility.ok}
          >
            Duda
          </button>
          <button
            className={`attendance-btn danger ${myAttendance?.attendanceStatus === "cancelled" ? "active" : ""}`}
            onClick={() => handleSetAttendance("cancelled")}
          >
            Fuera
          </button>
        </div>
        {!eligibility.ok && !myAttendance && <p className="warning">{eligibility.reason}</p>}
      </div>

      <div className="players-accordion">
        {renderPlayerList(confirmed, "Confirmados", true)}
        {renderPlayerList(maybe, "Quizás")}
        {renderPlayerList(cancelled, "No juegan")}
      </div>

      {isCreator && (
        <div className="danger-zone">
          <h3 className="section-title danger">Zona de riesgo</h3>
          <div className="danger-actions">
            <button className="neutral action-ghost" onClick={openWhatsApp}>WhatsApp</button>
            <button className="neutral action-ghost" onClick={share}>Compartir</button>
          </div>
          <button className="danger" onClick={() => onCancel(reservation.id)}>Eliminar reserva definitivamente</button>
        </div>
      )}

      {editing && (
        <div className="panel animate-in">
          <div className="field-group">
            <span className="field-title">Cancha</span>
            <select value={editCourtName} onChange={(e) => setEditCourtName(e.target.value)}>
              <option value="Cancha 1">Cancha 1</option>
              <option value="Cancha 2">Cancha 2</option>
            </select>
          </div>
          <div className="field-group">
            <span className="field-title">Fecha y hora</span>
            <input type="datetime-local" value={editStartDateTime} onChange={(e) => setEditStartDateTime(e.target.value)} />
          </div>
          <div className="field-group">
            <span className="field-title">Duración (min)</span>
            <select value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))}>
              <option value={60}>60m</option>
              <option value={90}>90m</option>
              <option value={120}>120m</option>
            </select>
          </div>
          <button onClick={submitEdit}>Guardar cambios</button>
        </div>
      )}
    </div>
  );
}
