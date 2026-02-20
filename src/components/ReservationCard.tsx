import type { Reservation, User } from "../lib/types";
import { getSignupsByStatus, getUserAttendance, triggerHaptic } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  onOpen: (id: string) => void;
  isExpanded: boolean;
};

export default function ReservationCard({ reservation, currentUser, onOpen, isExpanded }: Props) {
  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const mine = getUserAttendance(reservation, currentUser.id);
  const startDate = new Date(reservation.startDateTime);
  const month = startDate.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase();
  const day = startDate.toLocaleDateString("es-AR", { day: "2-digit" });
  const time = startDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

  const visibleConfirmed = confirmed.slice(0, 3);

  return (
    <button
      className={`reservation-card glass-panel-elite ${isExpanded ? "expanded" : ""}`}
      onClick={() => {
        triggerHaptic("light");
        onOpen(reservation.id);
      }}
    >
      <div className="card-date-column animate-fade-in">
        <span className="card-date-month">{month}</span>
        <span className="card-date-day">{day}</span>
      </div>

      <div className="reservation-card-main animate-fade-in">
        <div className="card-content-top">
          <strong className="card-title-main card-title-accent">{time}</strong>
          <span className="card-court-pill">{reservation.courtName}</span>
        </div>
        <div className="card-meta-line">
          {reservation.groupName ? <span className="card-meta-muted">{reservation.groupName}</span> : null}
          {reservation.venueName ? (
            <span>{reservation.groupName ? `· ${reservation.venueName}` : reservation.venueName}</span>
          ) : null}
        </div>

        <div className="card-content-bottom">
          <div className="player-info-row">
            <div className="avatar-stack">
              {visibleConfirmed.map((s, i) => (
                <div key={s.id} className="mini-avatar mini-avatar-elite-border" style={{ zIndex: 4 - i }}>
                  {s.userName.charAt(0).toUpperCase()}
                </div>
              ))}
              {confirmed.length > visibleConfirmed.length && (
                <div className="mini-avatar more">
                  +{confirmed.length - visibleConfirmed.length}
                </div>
              )}
            </div>
            <span className="player-count">
              <strong>{confirmed.length}</strong>/4
            </span>
          </div>

          <div className="card-badges">
            {mine && (
              <span className={`badge badge-mine badge-${mine.attendanceStatus} badge-elevated`}>
                {mine.attendanceStatus === "confirmed"
                  ? "Juego"
                  : mine.attendanceStatus === "maybe"
                    ? "Quizás"
                    : "No juego"}
              </span>
            )}
            {reservation.status === "cancelled" ? (
              <span className="badge badge-cancelled">Cancelada</span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
