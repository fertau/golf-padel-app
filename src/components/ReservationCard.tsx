import type { AttendanceStatus, Reservation, User } from "../lib/types";
import { getSignupsByStatus, getUserAttendance, isReservationCreator, triggerHaptic } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  attendanceStatusOverride?: AttendanceStatus;
  onOpen: (id: string) => void;
  isExpanded: boolean;
};

const getCardDateGroup = (iso: string): "hoy" | "manana" | "esta-semana" | "mas-adelante" => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
  const endOfWeek = new Date(todayStart);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const target = new Date(iso);
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const todayKey = `${todayStart.getFullYear()}-${todayStart.getMonth()}-${todayStart.getDate()}`;
  const tomorrowKey = `${tomorrowStart.getFullYear()}-${tomorrowStart.getMonth()}-${tomorrowStart.getDate()}`;
  const targetKey = `${targetDay.getFullYear()}-${targetDay.getMonth()}-${targetDay.getDate()}`;
  if (targetKey === todayKey) return "hoy";
  if (targetKey === tomorrowKey) return "manana";
  if (targetDay > tomorrowStart && targetDay <= endOfWeek) return "esta-semana";
  return "mas-adelante";
};

export default function ReservationCard({
  reservation,
  currentUser,
  attendanceStatusOverride,
  onOpen,
  isExpanded
}: Props) {
  const confirmed = getSignupsByStatus(reservation, "confirmed");
  const maybe = getSignupsByStatus(reservation, "maybe");
  const mine = getUserAttendance(reservation, currentUser.id);
  const startDate = new Date(reservation.startDateTime);
  const time = startDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const fullDay = startDate.toLocaleDateString("es-AR", { weekday: "long" }).replace(/^\w/, (c: string) => c.toUpperCase());
  const dayNum = startDate.getDate();
  const dayGroup = getCardDateGroup(reservation.startDateTime);
  const chipLabel = dayGroup === "hoy" ? "HOY" : dayGroup === "manana" ? "MAÑANA" : dayGroup === "esta-semana" ? "ESTA SEMANA" : "";
  const chipClass = dayGroup === "hoy" ? "today" : dayGroup === "manana" ? "tomorrow" : "later";

  const effectiveAttendanceStatus =
    attendanceStatusOverride ??
    mine?.attendanceStatus ??
    (isReservationCreator(reservation, currentUser.id) ? "confirmed" : null);

  const statusLabel = effectiveAttendanceStatus === "confirmed"
    ? "JUEGO" : effectiveAttendanceStatus === "maybe"
      ? "QUIZÁS" : effectiveAttendanceStatus === "cancelled"
        ? "NO JUEGO" : null;

  const statusBadgeClass = effectiveAttendanceStatus === "confirmed"
    ? "confirmed-badge" : effectiveAttendanceStatus === "maybe"
      ? "maybe-badge" : effectiveAttendanceStatus === "cancelled"
        ? "cancelled-badge" : "pending-badge";

  const confirmedCount = confirmed.length;
  const maybeCount = maybe.length;
  const emptySlots = Math.max(0, 4 - confirmedCount - maybeCount);

  return (
    <button
      className={`upcoming-row ${isExpanded ? "active" : ""}`}
      onClick={() => {
        triggerHaptic("light");
        onOpen(reservation.id);
      }}
    >
      <div className="ath-card-top">
        <div className="ath-date-block">
          {chipLabel && <span className={`ath-date-chip ${chipClass}`}>{chipLabel}</span>}
          <span className="ath-date-day">{fullDay} {dayNum}</span>
        </div>
        <span className="ath-time">{time}</span>
      </div>
      <div className="ath-venue">
        {reservation.courtName}
        {reservation.groupName && <span> · {reservation.groupName}</span>}
        {reservation.venueName && <span> · {reservation.venueName}</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="ath-players">
          {Array.from({ length: confirmedCount }).map((_, i) => (
            <span key={`c${i}`} className="ath-avatar confirmed">✓</span>
          ))}
          {Array.from({ length: maybeCount }).map((_, i) => (
            <span key={`m${i}`} className="ath-avatar maybe">?</span>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <span key={`e${i}`} className="ath-avatar empty">+</span>
          ))}
        </div>
        <div className="card-badges-ath">
          {statusLabel && (
            <span className={`ath-status-badge ${statusBadgeClass}`}>{statusLabel}</span>
          )}
          {reservation.status === "cancelled" && (
            <span className="ath-status-badge cancelled-badge">CANCELADA</span>
          )}
        </div>
      </div>
    </button>
  );
}
