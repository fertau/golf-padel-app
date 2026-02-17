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
  const mine = getUserAttendance(reservation, currentUser.id);
  const startDate = new Date(reservation.startDateTime);
  const month = startDate.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase();
  const day = startDate.toLocaleDateString("es-AR", { day: "2-digit" });
  const time = startDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <button
      className={`reservation-card ${isExpanded ? "expanded" : ""}`}
      onClick={() => onOpen(reservation.id)}
    >
      <div className="card-date-column">
        <span className="card-date-month">{month}</span>
        <span className="card-date-day">{day}</span>
      </div>

      <div className="reservation-card-main">
        <div className="card-content-top">
          <strong className="card-title-main">{time}</strong>
          <span className="card-court-pill">{reservation.courtName}</span>
        </div>

        <div className="card-content-bottom">
          <div className="player-info-row">
            <div className="avatar-stack">
              {confirmed.slice(0, 4).map((s, i) => (
                <div key={s.id} className="mini-avatar" style={{ zIndex: 4 - i }}>
                  {s.userName.charAt(0).toUpperCase()}
                </div>
              ))}
              {confirmed.length > 4 && (
                <div className="mini-avatar more">
                  +{confirmed.length - 4}
                </div>
              )}
            </div>
            <span className="player-count">
              <strong>{confirmed.length}</strong>/4
            </span>
          </div>

          <div className="card-badges">
            {mine && (
              <span className={`badge badge-${mine.attendanceStatus}`}>
                {mine.attendanceStatus === "confirmed"
                  ? "Juego"
                  : mine.attendanceStatus === "maybe"
                    ? "Duda"
                    : "Fuera"}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
