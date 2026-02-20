import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import type { VercelRequestLike, VercelResponseLike } from "../_lib/http.js";

const chunkItems = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const inferScope = (reservation: Record<string, any>) => {
  if (reservation.visibilityScope === "group" || reservation.visibilityScope === "link_only") {
    return reservation.visibilityScope;
  }
  return reservation.groupId && reservation.groupId !== "default-group" ? "group" : "link_only";
};

const isRelatedToUser = (reservation: Record<string, any>, authUid: string) => {
  if (reservation.createdByAuthUid === authUid) return true;
  if (reservation.createdBy?.id === authUid) return true;
  if (Array.isArray(reservation.guestAccessUids) && reservation.guestAccessUids.includes(authUid)) return true;
  if (Array.isArray(reservation.signups)) {
    return reservation.signups.some((signup: Record<string, any>) => signup?.authUid === authUid || signup?.userId === authUid);
  }
  return false;
};

export default async function handler(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authUid = await requireAuthUid(req);
    const [memberSnapshot, ownerSnapshot, adminSnapshot] = await Promise.all([
      adminDb.collection("groups").where("memberAuthUids", "array-contains", authUid).get(),
      adminDb.collection("groups").where("ownerAuthUid", "==", authUid).get(),
      adminDb.collection("groups").where("adminAuthUids", "array-contains", authUid).get()
    ]);

    const allowedGroupIds = new Set<string>();
    [memberSnapshot, ownerSnapshot, adminSnapshot].forEach((snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        const group = snapshotDoc.data() ?? {};
        if (group.isDeleted === true) return;
        allowedGroupIds.add(snapshotDoc.id);
      });
    });

    const reservationQueries: Array<Promise<any>> = [
      adminDb.collection("reservations").where("createdByAuthUid", "==", authUid).get(),
      adminDb.collection("reservations").where("createdBy.id", "==", authUid).get(),
      adminDb.collection("reservations").where("guestAccessUids", "array-contains", authUid).get()
    ];

    chunkItems(Array.from(allowedGroupIds), 10).forEach((chunk) => {
      reservationQueries.push(adminDb.collection("reservations").where("groupId", "in", chunk).get());
    });

    const reservationSnapshots = await Promise.all(reservationQueries);
    const merged = new Map<string, Record<string, any>>();
    reservationSnapshots.forEach((snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        merged.set(snapshotDoc.id, { id: snapshotDoc.id, ...(snapshotDoc.data() ?? {}) });
      });
    });

    const reservations = Array.from(merged.values())
      .filter((reservation) => {
        const scope = inferScope(reservation);
        if (scope === "group" && reservation.groupId && allowedGroupIds.has(reservation.groupId)) {
          return true;
        }
        return isRelatedToUser(reservation, authUid);
      })
      .sort((a, b) => String(a.startDateTime ?? "").localeCompare(String(b.startDateTime ?? "")));

    res.status(200).json({ reservations });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudieron cargar las reservas." });
  }
}
