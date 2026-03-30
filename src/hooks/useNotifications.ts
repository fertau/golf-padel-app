import { useEffect, useState, useCallback } from "react";
import { registerPushToken, unregisterPushTokens, isPushGranted, setBadgeCount } from "../lib/push";
import { checkAndTrigger2hReminders, shouldShowIOSInstallBanner } from "../lib/notifications";
import { auth } from "../lib/firebase";
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

function loadLocalPrefs(): PushPreferences {
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
  const [pushPrefs, setPushPrefs] = useState<PushPreferences>(loadLocalPrefs);
  const [inAppNotifications, setInAppNotifications] = useState<NotificationItem[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences from server on login
  useEffect(() => {
    if (!isLoggedIn || prefsLoaded) return;
    const loadFromServer = async () => {
      try {
        const firebaseAuth = auth;
        if (!firebaseAuth?.currentUser) return;
        const idToken = await firebaseAuth.currentUser.getIdToken();
        const res = await fetch("/api/push/preferences", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPushPrefs(data);
          localStorage.setItem(PREFS_KEY, JSON.stringify(data));
        }
      } catch {
        // Fall back to localStorage
      }
      setPrefsLoaded(true);
    };
    loadFromServer();
  }, [isLoggedIn, prefsLoaded]);

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

  const dismissIOSBanner = useCallback(() => {
    setShowIOSBanner(false);
    localStorage.setItem(IOS_BANNER_KEY, "1");
  }, []);

  const updatePushPreferences = useCallback(async (update: Partial<PushPreferences>) => {
    const next = { ...pushPrefs, ...update };
    if (update.notifications) {
      next.notifications = { ...pushPrefs.notifications, ...update.notifications };
    }
    setPushPrefs(next);
    // Local cache
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* silent */ }
    // Persist to server (fire-and-forget)
    try {
      const firebaseAuth = auth;
      if (!firebaseAuth?.currentUser) return;
      const idToken = await firebaseAuth.currentUser.getIdToken();
      fetch("/api/push/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(update),
      }).catch(() => null);
    } catch { /* silent */ }
  }, [pushPrefs]);

  const markAllRead = useCallback(() => {
    setInAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const handleTapNotification = useCallback((item: NotificationItem) => {
    if (item.reservationId && onNavigateToMatch) {
      onNavigateToMatch(item.reservationId);
    }
  }, [onNavigateToMatch]);

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
