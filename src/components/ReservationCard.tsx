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
  const mine = getUserAttendance(reservation, currentUser.id);

  return (
    <button
      className={`reservation-card elite-card ${isExpanded ? "expanded" : ""}`}
      onClick={() => onOpen(reservation.id)}
    >
      <div className="reservation-card-glow" />
      <div className="reservation-card-main">
        <div className="card-header">
          <div className="card-title-group">
            <span className="card-label">Cancha</span>
            <strong className="text-dynamic">{reservation.courtName}</strong>
          </div>
          <div className="card-time-group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <span>{formatDateTime(reservation.startDateTime)}</span>
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
              {confirmed.length === 0 && <span className="empty-hint">Buscando jugadores...</span>}
            </div>
            <span className="player-count"><strong>{confirmed.length}</strong>/4 Confirmed</span>
          </div>

          <div className="card-badges">
            {mine && (
              <span className={`badge badge-mine badge-${mine.attendanceStatus}`}>
                {mine.attendanceStatus === "confirmed" ? "Juego" : mine.attendanceStatus === "maybe" ? "Duda" : "Fuera"}
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
