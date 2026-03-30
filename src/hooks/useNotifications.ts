import { useEffect, useState } from "react";
import { registerPushToken, unregisterPushTokens, isPushGranted, setBadgeCount } from "../lib/push";
import { checkAndTrigger2hReminders, shouldShowIOSInstallBanner } from "../lib/notifications";
import type { Reservation } from "../lib/types";

type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  reservationId?: string;
  createdAt: string;
  read: boolean;
};

type PushPreferences = {
  pushEnabled: boolean;
  notifications?: Record<string, boolean>;
};

const PREFS_KEY = "golf-padel-push-prefs";
const IOS_BANNER_KEY = "golf-padel-ios-banner-dismissed";

function loadPushPrefs(): PushPreferences {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { pushEnabled: true };
}

export function useNotifications(
  isLoggedIn: boolean,
  reservations: Reservation[],
  activeTab: string,
  onNavigateToMatch?: (reservationId: string) => void
) {
  const [showIOSBanner, setShowIOSBanner] = useState(
    () => shouldShowIOSInstallBanner() && localStorage.getItem(IOS_BANNER_KEY) !== "1"
  );
  const [pushPrefs, setPushPrefs] = useState<PushPreferences>(loadPushPrefs);
  const [inAppNotifications, setInAppNotifications] = useState<NotificationItem[]>([]);

  // Check 2h reminders on app open (best-effort)
  useEffect(() => {
    if (!isLoggedIn || reservations.length === 0) return;
    checkAndTrigger2hReminders(reservations).catch(() => null);
  }, [isLoggedIn, reservations.length > 0]);

  // Clear badge when opening Partidos tab
  useEffect(() => {
    if (activeTab === "mis-partidos") {
      setBadgeCount(0);
      setInAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  }, [activeTab]);

  // Listen for SW notification clicks (deep link)
  useEffect(() => {
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICK" && event.data.url) {
        const url = event.data.url as string;
        // Extract reservationId from /partidos/:id
        const match = url.match(/\/partidos\/([a-zA-Z0-9-]+)/);
        if (match && onNavigateToMatch) {
          onNavigateToMatch(match[1]);
        } else {
          window.history.pushState(null, "", url);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, [onNavigateToMatch]);

  const dismissIOSBanner = () => {
    setShowIOSBanner(false);
    localStorage.setItem(IOS_BANNER_KEY, "1");
  };

  const updatePushPreferences = (update: Partial<PushPreferences>) => {
    const next = { ...pushPrefs, ...update };
    if (update.notifications) {
      next.notifications = { ...pushPrefs.notifications, ...update.notifications };
    }
    setPushPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch { /* silent */ }
  };

  const markAllRead = () => {
    setInAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleTapNotification = (item: NotificationItem) => {
    if (item.reservationId && onNavigateToMatch) {
      onNavigateToMatch(item.reservationId);
    }
  };

  return {
    showIOSBanner,
    dismissIOSBanner,
    pushPrefs,
    updatePushPreferences,
    inAppNotifications,
    setInAppNotifications,
    markAllRead,
    handleTapNotification,
    isPushGranted: isPushGranted(),
    registerPushToken,
    unregisterPushTokens,
  };
}
