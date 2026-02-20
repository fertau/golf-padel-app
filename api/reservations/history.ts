import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import type { VercelRequestLike, VercelResponseLike } from "../_lib/http.js";

const parseQueryValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const isRelatedToUser = (reservation: Record<string, any>, authUid: string) => {
  if (reservation.createdByAuthUid === authUid) return true;
  if (reservation.createdBy?.id === authUid) return true;
  if (Array.isArray(reservation.guestAccessUids) && reservation.guestAccessUids.includes(authUid)) return true;
  if (Array.isArray(reservation.signups)) {
    return reservation.signups.some(
      (signup: Record<string, any>) => signup?.authUid === authUid || signup?.userId === authUid
    );
  }
  return false;
};

const toTimestamp = (value: unknown): number | null => {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export default async function handler(
  req: VercelRequestLike & {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  },
  res: VercelResponseLike
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authUid = await requireAuthUid(req);
    const rawLimit = Number.parseInt(parseQueryValue(req.query?.limit) ?? "200", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;
    const now = Date.now();
    const [createdSnapshot, legacyCreatedSnapshot, guestSnapshot, fullSnapshot] = await Promise.all([
      adminDb.collection("reservations").where("createdByAuthUid", "==", authUid).get(),
      adminDb.collection("reservations").where("createdBy.id", "==", authUid).get(),
      adminDb.collection("reservations").where("guestAccessUids", "array-contains", authUid).get(),
      adminDb.collection("reservations").get()
    ]);

    const merged = new Map<string, Record<string, any>>();
    [createdSnapshot, legacyCreatedSnapshot, guestSnapshot, fullSnapshot].forEach((snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data() ?? {};
        const reservation = { id: snapshotDoc.id, ...data };
        if (!isRelatedToUser(reservation, authUid)) {
          return;
        }
        const timestamp = toTimestamp(reservation.startDateTime);
        if (timestamp === null || timestamp >= now) {
          return;
        }
        merged.set(snapshotDoc.id, reservation);
      });
    });

    const reservations = Array.from(merged.values())
      .sort((a, b) => {
        const aTime = toTimestamp(a.startDateTime) ?? 0;
        const bTime = toTimestamp(b.startDateTime) ?? 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    res.status(200).json({ reservations });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudo cargar el historial." });
  }
}
