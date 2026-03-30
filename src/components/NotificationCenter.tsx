import { useEffect, useState } from "react";
import { triggerHaptic } from "../lib/utils";

type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  reservationId?: string;
  createdAt: string;
  read: boolean;
};

type Props = {
  notifications: NotificationItem[];
  onTapNotification: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onViewAll: () => void;
};

const eventDotColor: Record<string, string> = {
  match_full: "var(--accent-green, #22c55e)",
  attendance_confirmed: "var(--accent-green, #22c55e)",
  need_players: "var(--accent-red, #ef4444)",
  match_cancelled: "var(--accent-red, #ef4444)",
  match_created: "var(--accent-blue, #3b82f6)",
  reminder_24h: "var(--accent-blue, #3b82f6)",
  reminder_2h: "var(--accent-blue, #3b82f6)",
  attendance_change: "var(--text-muted, #94a3b8)",
};

const getDotColor = (eventType: string) => eventDotColor[eventType] ?? "var(--text-muted, #94a3b8)";

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

export default function NotificationCenter({ notifications, onTapNotification, onMarkAllRead, onViewAll }: Props) {
  const [visible, setVisible] = useState(true);
  const unreadCount = notifications.filter(n => !n.read).length;
  const recent = notifications.slice(0, 5);

  if (recent.length === 0) {
    return (
      <section className="notification-center notification-center-empty">
        <div className="notification-center-header">
          <h3 className="notification-center-title">Novedades</h3>
        </div>
        <p className="notification-empty-text">
          Sin novedades por ahora. Creá un partido para empezar!
        </p>
      </section>
    );
  }

  return (
    <section className="notification-center">
      <div className="notification-center-header">
        <h3 className="notification-center-title">
          Novedades
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </h3>
        <button
          type="button"
          className="notification-view-all"
          onClick={() => {
            triggerHaptic("light");
            onViewAll();
          }}
        >
          Ver todo
        </button>
      </div>
      <div className="notification-list">
        {recent.map(item => (
          <button
            key={item.id}
            type="button"
            className={`notification-item ${item.read ? "" : "notification-item-unread"}`}
            onClick={() => {
              triggerHaptic("light");
              onTapNotification(item);
            }}
          >
            <span
              className="notification-dot"
              style={{ backgroundColor: getDotColor(item.eventType) }}
              aria-hidden="true"
            />
            <div className="notification-content">
              <span className="notification-body">{item.body}</span>
              <span className="notification-time">{timeAgo(item.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
