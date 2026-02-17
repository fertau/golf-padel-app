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

  const formatCompactDate = (iso: string): string => {
    const date = new Date(iso);
    const dd = `${date.getDate()}`.padStart(2, "0");
    const mm = `${date.getMonth() + 1}`.padStart(2, "0");
    const hh = `${date.getHours()}`.padStart(2, "0");
    const min = `${date.getMinutes()}`.padStart(2, "0");
    return `${dd}/${mm} a las ${hh}:${min}`;
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
    <details className="player-collapse-elite" open={isOpen}>
      <summary>
        <div className="summary-content">
          <span>{label}</span>
          <div className="summary-badge">{list.length}</div>
        </div>
      </summary>
      <div className="player-list-elite">
        {list.length === 0 ? <p className="empty-state-list">Sin registros aún.</p> : null}
        {list.map((signup, index) => (
          <div key={signup.id} className="player-row-elite">
            <div className="player-avatar-mini">{formatSignupName(signup).charAt(0)}</div>
            <span className="player-name">{formatSignupName(signup)}</span>
            {index === 0 && label === "Juego" && <span className="host-label">Organizador</span>}
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
    <div className="reservation-hero-view">
      <header className="hero-header">
        <div className="hero-badge">{reservation.durationMinutes} min</div>
        <h1>{reservation.courtName}</h1>
        <p className="hero-subtitle">{formatCompactDate(reservation.startDateTime)}</p>
      </header>

      <div className="hero-stats-grid">
        <div className="hero-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          <div className="stat-info"><strong>{confirmed.length}/4</strong><span>Jugadores</span></div>
        </div>
        <div className="hero-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          <div className="stat-info"><strong>{reservation.durationMinutes}m</strong><span>Duración</span></div>
        </div>
      </div>

      <section className="attendance-section-elite">
        <h3>Tu asistencia</h3>
        <div className="attendance-pills-elite">
          <button
            className={`elite-choice confirmed ${myAttendance?.attendanceStatus === "confirmed" ? "active" : ""}`}
            onClick={() => handleSetAttendance("confirmed")}
          >
            Confirmado
          </button>
          <button
            className={`elite-choice maybe ${myAttendance?.attendanceStatus === "maybe" ? "active" : ""}`}
            onClick={() => handleSetAttendance("maybe")}
            disabled={!myAttendance && !eligibility.ok}
          >
            En duda
          </button>
          <button
            className={`elite-choice cancelled ${myAttendance?.attendanceStatus === "cancelled" ? "active" : ""}`}
            onClick={() => handleSetAttendance("cancelled")}
          >
            Fuera
          </button>
        </div>
        {!eligibility.ok && !myAttendance && <p className="eligibility-warning">{eligibility.reason}</p>}
      </section>

      <div className="players-section-elite">
        {renderPlayerList(confirmed, "Confirmados", true)}
        {renderPlayerList(maybe, "Quizás")}
        {renderPlayerList(cancelled, "No juegan")}
      </div>

      <div className="actions-section-elite">
        <button className="btn-secondary-elite" onClick={openGoogleCalendar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          Google Calendar
        </button>

        {isCreator && (
          <div className="creator-actions-elite">
            <button className="btn-secondary-elite" onClick={openWhatsApp}>WhatsApp</button>
            <button className="btn-secondary-elite" onClick={share}>Compartir</button>
            <button className="btn-outline-danger-elite" onClick={() => setEditing(!editing)}>
              {editing ? "Cerrar edición" : "Modificar reserva"}
            </button>
            <button className="btn-link-danger-elite" onClick={() => onCancel(reservation.id)}>Eliminar reserva</button>
          </div>
        )}
      </div>

      {editing && (
        <div className="edit-pane-elite glass-effect">
          <label>Cancha
            <select value={editCourtName} onChange={(e) => setEditCourtName(e.target.value)}>
              <option value="Cancha 1">Cancha 1</option><option value="Cancha 2">Cancha 2</option>
            </select>
          </label>
          <label>Fecha y hora
            <input type="datetime-local" value={editStartDateTime} onChange={(e) => setEditStartDateTime(e.target.value)} />
          </label>
          <label>Duración
            <select value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))}>
              <option value={60}>60m</option><option value={90}>90m</option><option value={120}>120m</option>
            </select>
          </label>
          <button className="btn-primary-elite" onClick={submitEdit}>Guardar cambios</button>
        </div>
      )}
    </div>
  );
}
