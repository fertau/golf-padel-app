import { useState } from "react";
import type { AttendanceStatus, Reservation, User, Signup } from "../lib/types";
import {
  buildWhatsAppMessage,
  canJoinReservation,
  getSignupsByStatus,
  getUserAttendance,
  isReservationCreator,
  triggerHaptic
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
        // Fallback to clipboard if share cancelled or failed
      }
    }
    await navigator.clipboard.writeText(message);
    alert("Mensaje copiado");
  };

  const copyMessage = async () => {
    triggerHaptic("light");
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
    return `${dd}/${mm} ${hh}:${min}`;
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
      <summary>
        <span>{label}</span>
        <strong>{list.length}</strong>
      </summary>
      <div className="player-list compact">
        {list.length === 0 ? <p className="private-hint">Sin jugadores.</p> : null}
        {list.map((signup, index) => (
          <div key={signup.id} className="player-row compact">
            <span className="player-index">{index + 1}</span>
            <span className="player-name text-dynamic">{formatSignupName(signup)}</span>
          </div>
        ))}
      </div>
    </details>
  );

  const formatSignupName = (signup: Signup): string => {
    const normalizedName = signup.userName?.trim() || "Jugador";
    if (normalizedName.toLowerCase() !== "jugador") {
      return normalizedName;
    }
    const suffixSource = signup.authUid || signup.userId || signup.id;
    return `Jugador #${suffixSource.slice(-4).toUpperCase()}`;
  };

  return (
    <section className="panel panel-detail">
      <div className="detail-title-row">
        <h3>Detalle del partido</h3>
        <span className="meta-pill">{reservation.durationMinutes} min</span>
      </div>

      <div className="detail-meta-grid">
        <div className="detail-meta-item"><span>Cancha</span><strong>{reservation.courtName}</strong></div>
        <div className="detail-meta-item"><span>Fecha y hora</span><strong>{formatCompactDate(reservation.startDateTime)}</strong></div>
        <div className="detail-meta-item"><span>Reservó</span><small>{reservation.createdBy.name}</small></div>
      </div>

      <div className="actions">
        <button
          className={`success attendance-btn ${myAttendance?.attendanceStatus === "confirmed" ? "active" : ""}`}
          onClick={() => handleSetAttendance("confirmed")}
          disabled={myAttendance?.attendanceStatus === "confirmed"}
        >
          Juego
        </button>
        <button
          className={`neutral attendance-btn ${myAttendance?.attendanceStatus === "maybe" ? "active" : ""}`}
          onClick={() => handleSetAttendance("maybe")}
          disabled={myAttendance?.attendanceStatus === "maybe" || (!myAttendance && !eligibility.ok)}
        >
          Quizás
        </button>
        <button
          className={`danger attendance-btn ${myAttendance?.attendanceStatus === "cancelled" ? "active" : ""}`}
          onClick={() => handleSetAttendance("cancelled")}
          disabled={myAttendance?.attendanceStatus === "cancelled"}
        >
          No juego
        </button>
      </div>

      {!eligibility.ok && !myAttendance ? <p className="warning">{eligibility.reason}</p> : null}

      <div className="players-accordion">
        {renderPlayerList(confirmed, "Juego", true)}
        {renderPlayerList(maybe, "Quizás")}
        {renderPlayerList(cancelled, "No juego")}
      </div>

      <div className="actions actions-calendar">
        <button className="action-ghost" onClick={openGoogleCalendar}>
          <span className="button-icon" aria-hidden="true">G</span>
          Agregar a Google Calendar
        </button>
      </div>

      {isCreator ? (
        <div className="actions actions-share" style={{ marginTop: '16px' }}>
          <button className="action-ghost" onClick={openWhatsApp}><span className="button-icon">W</span>Whatsapp</button>
          <button className="action-ghost" onClick={share}><span className="button-icon">↗</span>Compartir</button>
          <button className="action-ghost" onClick={copyMessage}><span className="button-icon">⧉</span>Copiar</button>
        </div>
      ) : null}

      {isCreator ? (
        <div className="danger-zone" style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
          <div className="actions danger-actions">
            <button type="button" className="danger-outline" onClick={() => { setEditing(!editing); triggerHaptic("light"); }}>
              {editing ? "Cancelar edición" : "Modificar reserva"}
            </button>
            <button className="danger" onClick={() => { onCancel(reservation.id); triggerHaptic("heavy"); }}>
              Cancelar reserva
            </button>
          </div>
        </div>
      ) : null}

      {isCreator && editing ? (
        <div className="panel account-panel" style={{ marginTop: '16px', background: 'rgba(255,255,255,0.03)' }}>
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
          <button type="button" onClick={submitEdit}>Guardar cambios</button>
        </div>
      ) : null}
    </section>
  );
}
