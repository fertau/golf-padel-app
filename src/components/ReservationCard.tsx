import type { Reservation, User } from "../lib/types";
import { getSignupsByStatus, getUserAttendance } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  onOpen: (id: string) => void;
  isExpanded: boolean;
};

export default function ReservationCard({ reservation, currentUser, onOpen, isExpanded }: Props) {
  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const maybe = getSignupsByStatus(reservation, "maybe");
  const cancelled = getSignupsByStatus(reservation, "cancelled");
  const mine = getUserAttendance(reservation, currentUser.id);
  const start = new Date(reservation.startDateTime);
  const dayLabel = start.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  const dateLabel = start.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  const timeLabel = start.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <button
      className={`reservation-card ${isExpanded ? "expanded" : ""}`}
      onClick={() => onOpen(reservation.id)}
    >
      <div className="reservation-card-glow" />
      <div className="reservation-card-main">
        <div className="card-header">
          <div className="card-title-group">
            <span className="card-label">Cancha</span>
            <strong className="text-dynamic card-title">{reservation.courtName}</strong>
          </div>
          <div className="card-datetime-chips" aria-label="Fecha y hora del partido">
            <span className="date-chip">{dayLabel}</span>
            <span className="date-chip">{dateLabel}</span>
            <span className="date-chip">{timeLabel}</span>
          </div>
        </div>

        <div className="card-footer">
          <div className="player-stats">
            <div className="avatar-stack">
              {confirmed.slice(0, 3).map((s, i) => (
                <div key={s.id} className="mini-avatar" style={{ zIndex: 3 - i }}>
                  {s.userName.charAt(0)}
                </div>
              ))}
              {confirmed.length > 3 && <div className="mini-avatar more">+{confirmed.length - 3}</div>}
              {confirmed.length === 0 && <span className="empty-hint">Faltan jugadores...</span>}
            </div>
            <span className="player-count">
              <strong>Juego {confirmed.length}</strong> · Quizás {maybe.length} · No juego {cancelled.length}
            </span>
          </div>

          <div className="card-badges">
            {mine && (
              <span className={`badge badge-mine badge-${mine.attendanceStatus}`}>
                {mine.attendanceStatus === "confirmed"
                  ? "Juego"
                  : mine.attendanceStatus === "maybe"
                    ? "Quizás"
                    : "No juego"}
              </span>
            )}
            <div className="disclosure-chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
