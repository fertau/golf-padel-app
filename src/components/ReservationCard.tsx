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
  const groupLabel = reservation.groupName?.trim() || "Sin grupo";
  const venueLabel = reservation.venueName?.trim() || "Sin complejo";
  const shouldMarqueeVenue = venueLabel.length > 24;

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
          <strong className="card-title-main card-time-main">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            <span>{time}</span>
          </strong>
          <span className="card-court-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V9" />
              <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11A2.5 2.5 0 0 0 20 17.5V15" />
              <path d="M4 12h16" />
              <path d="M12 4v16" />
            </svg>
            <span>{reservation.courtName}</span>
          </span>
        </div>
        <div className="card-meta-line">
          <span className="card-meta-chip card-meta-chip-group">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="3" />
              <path d="M20 8v6" />
              <path d="M23 11h-6" />
            </svg>
            <span>{groupLabel}</span>
          </span>
          <span
            className={`card-meta-chip card-meta-chip-venue ${shouldMarqueeVenue ? "is-marquee" : ""}`}
            title={venueLabel}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="card-meta-chip-label">
              {shouldMarqueeVenue ? (
                <span className="card-meta-marquee-track">{`${venueLabel}  •  ${venueLabel}`}</span>
              ) : (
                venueLabel
              )}
            </span>
          </span>
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
            <span className="disclosure-chevron" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
