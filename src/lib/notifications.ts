import { auth } from "./firebase";

type NotificationEventType =
  | "match_created"
  | "match_updated"
  | "attendance_change"
  | "need_players"
  | "match_full"
  | "match_cancelled";

type TriggerPayload = {
  eventType: NotificationEventType;
  reservationId: string;
  playerName?: string;
  attendanceAction?: "confirmed" | "cancelled";
  previousConfirmedCount?: number;
};

/**
 * Fire-and-forget push notification trigger.
 * Called after client-side mutations to notify relevant users.
 * Failures are silently logged — never blocks the user.
 */
export async function triggerPushNotification(payload: TriggerPayload): Promise<void> {
  try {
    const firebaseAuth = auth;
    if (!firebaseAuth?.currentUser) return;

    const idToken = await firebaseAuth.currentUser.getIdToken();
    fetch("/api/push?action=trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silent fail — push is best-effort
    });
  } catch {
    // Silent fail
  }
}

/**
 * Check for matches within 2h and trigger reminder if not already sent.
 * Called on app open (best-effort for Hobby plan cron limitation).
 */
export async function checkAndTrigger2hReminders(
  reservations: Array<{ id: string; startDateTime?: string; date?: string; notificationsSent?: Record<string, boolean> }>
): Promise<void> {
  const now = Date.now();
  const twoHoursFromNow = now + 2 * 60 * 60 * 1000;

  for (const res of reservations) {
    const dateStr = res.startDateTime ?? res.date;
    if (!dateStr) continue;

    const matchTime = new Date(dateStr).getTime();
    if (isNaN(matchTime)) continue;

    // Match is within 2h but not in the past
    if (matchTime > now && matchTime <= twoHoursFromNow) {
      // Skip if already notified
      if (res.notificationsSent?.reminder_2h) continue;

      // Trigger via server (so all confirmed players get it, not just this user)
      try {
        const firebaseAuth = auth;
        if (!firebaseAuth?.currentUser) return;

        const idToken = await firebaseAuth.currentUser.getIdToken();
        await fetch("/api/push?action=reminder-2h", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ reservationId: res.id }),
        });
      } catch {
        // Silent fail
      }
    }
  }
}

/**
 * Detect if running on iOS Safari without "Add to Home Screen".
 * Push notifications require the PWA to be installed on iOS.
 */
export function shouldShowIOSInstallBanner(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;

  return isIOS && isSafari && !isStandalone;
}
// Build trigger 1774911007
