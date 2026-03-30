import { getMessaging } from "firebase-admin/messaging";
import { adminDb } from "./firebaseAdmin.js";

type PushToken = {
  token: string;
  platform: string;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
};

type NotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  sound?: string;
  vibrate?: number[];
  data?: Record<string, string>;
};

/**
 * Send push notification to a list of user UIDs.
 * Handles: multi-device fan-out, stale token cleanup, preference check,
 * FCM rate limit retry (1 attempt), and silent skip for missing tokens.
 */
export async function sendPushToUsers(
  uids: string[],
  notification: NotificationPayload,
  eventType: string
): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const uid of uids) {
    try {
      // Check preference
      const prefsDoc = await adminDb.collection("users").doc(uid).collection("preferences").doc("notifications").get();
      const prefs = prefsDoc.exists ? prefsDoc.data() : undefined;
      const pushEnabled = prefs?.pushEnabled ?? true; // default enabled
      if (!pushEnabled) {
        skipped++;
        continue;
      }

      // Per-type preference check (Phase 2: granular preferences)
      if (prefs?.notifications && prefs.notifications[eventType] === false) {
        skipped++;
        continue;
      }

      // Get tokens
      const tokensDoc = await adminDb.collection("pushTokens").doc(uid).get();
      if (!tokensDoc.exists) {
        skipped++;
        continue;
      }

      const tokenData = tokensDoc.data();
      const tokens: PushToken[] = tokenData?.tokens ?? [];
      if (tokens.length === 0) {
        skipped++;
        continue;
      }

      // Build FCM message for multicast
      const fcmTokens = tokens.map(t => t.token);
      const message = {
        tokens: fcmTokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        webpush: {
          notification: {
            icon: notification.icon ?? "/favicon.svg",
            ...(notification.vibrate ? { vibrate: notification.vibrate } : {}),
          },
          fcmOptions: {
            link: notification.data?.url ?? "/",
          },
        },
        data: notification.data ?? {},
      };

      const response = await sendWithRetry(message);

      // Handle per-token results
      const staleTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (resp.success) {
          sent++;
        } else {
          const code = resp.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            staleTokens.push(fcmTokens[idx]);
          } else {
            errors++;
            console.error(`[pushSend] FCM error for uid=${uid} token=${fcmTokens[idx].slice(0, 8)}...: ${code}`);
          }
        }
      });

      // Clean up stale tokens
      if (staleTokens.length > 0) {
        const updatedTokens = tokens.filter(t => !staleTokens.includes(t.token));
        await adminDb.collection("pushTokens").doc(uid).set({ tokens: updatedTokens });
        console.log(`[pushSend] Removed ${staleTokens.length} stale token(s) for uid=${uid}`);
      }
    } catch (error) {
      errors++;
      console.error(`[pushSend] Error sending to uid=${uid}, event=${eventType}:`, (error as Error).message);
    }
  }

  return { sent, skipped, errors };
}

async function sendWithRetry(
  message: Parameters<ReturnType<typeof getMessaging>["sendEachForMulticast"]>[0],
  retries = 1
) {
  const messaging = getMessaging();
  try {
    return await messaging.sendEachForMulticast(message);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "messaging/message-rate-exceeded" && retries > 0) {
      console.warn("[pushSend] Rate limited, retrying after 1s...");
      await new Promise(r => setTimeout(r, 1000));
      return sendWithRetry(message, retries - 1);
    }
    throw error;
  }
}
