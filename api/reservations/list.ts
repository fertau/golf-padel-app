import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

const parseQueryValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

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

type CreateReservationBody = {
  groupId?: string;
  groupName?: string;
  visibilityScope?: "group" | "link_only";
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  courtId?: string;
  courtName?: string;
  startDateTime?: string;
  durationMinutes?: number;
  currentUserName?: string;
};

const nowIso = () => new Date().toISOString();

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const stripUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue;
      next[key] = stripUndefinedDeep(nested);
    }
    return next as T;
  }
  return value;
};

const handleCreate = async (
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) => {
  const authUid = await requireAuthUid(req);
  const body = parseBody<CreateReservationBody>(req.body);

  const startDateTime = normalizeText(body.startDateTime);
  const parsedStart = toTimestamp(startDateTime);
  if (!startDateTime || parsedStart === null) {
    res.status(400).json({ error: "Fecha/hora inválida." });
    return;
  }

  const durationMinutes =
    typeof body.durationMinutes === "number" && Number.isFinite(body.durationMinutes) && body.durationMinutes > 0
      ? Math.round(body.durationMinutes)
      : 90;

  const requestedScope =
    body.visibilityScope === "group" || body.visibilityScope === "link_only"
      ? body.visibilityScope
      : body.groupId && body.groupId !== "default-group"
        ? "group"
        : "link_only";

  let groupId = "default-group";
  let groupName: string | undefined;
  if (requestedScope === "group") {
    const targetGroupId = normalizeText(body.groupId);
    if (!targetGroupId || targetGroupId === "default-group") {
      res.status(400).json({ error: "Seleccioná un grupo válido." });
      return;
    }

    const groupSnapshot = await adminDb.collection("groups").doc(targetGroupId).get();
    if (!groupSnapshot.exists) {
      res.status(404).json({ error: "Grupo no encontrado." });
      return;
    }

    const group = groupSnapshot.data() as {
      name?: string;
      ownerAuthUid?: string;
      adminAuthUids?: string[];
      memberAuthUids?: string[];
      isDeleted?: boolean;
    };
    if (group.isDeleted === true) {
      res.status(404).json({ error: "Grupo no disponible." });
      return;
    }
    const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
    const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
    const canAccessGroup =
      group.ownerAuthUid === authUid || adminAuthUids.includes(authUid) || memberAuthUids.includes(authUid);
    if (!canAccessGroup) {
      res.status(403).json({ error: "No tenés permisos para crear reservas en este grupo." });
      return;
    }

    groupId = targetGroupId;
    groupName = normalizeText(body.groupName) || normalizeText(group.name) || undefined;
  }

  const reservationId = crypto.randomUUID();
  const payload = {
    id: reservationId,
    groupId,
    groupName,
    visibilityScope: requestedScope,
    venueId: normalizeText(body.venueId) || undefined,
    venueName: normalizeText(body.venueName) || undefined,
    venueAddress: normalizeText(body.venueAddress) || undefined,
    courtId: normalizeText(body.courtId) || undefined,
    courtName: normalizeText(body.courtName) || "Cancha a definir",
    startDateTime,
    durationMinutes,
    createdBy: {
      id: authUid,
      name: normalizeText(body.currentUserName) || `Jugador #${authUid.slice(-4).toUpperCase()}`
    },
    createdByAuthUid: authUid,
    rules: {
      maxPlayersAccepted: 9999,
      priorityUserIds: [],
      allowWaitlist: true
    },
    guestAccessUids: [],
    signups: [],
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await adminDb.collection("reservations").doc(reservationId).set(stripUndefinedDeep(payload));
  res.status(200).json({ ok: true, reservationId });
};

const handleGet = async (
  req: VercelRequestLike & {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  },
  res: VercelResponseLike
) => {
  const authUid = await requireAuthUid(req);
  const mode = parseQueryValue(req.query?.mode)?.trim().toLowerCase() ?? "active";

  if (mode === "history") {
    const rawLimit = Number.parseInt(parseQueryValue(req.query?.limit) ?? "200", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;
    const now = Date.now();

    const [createdSnapshot, legacyCreatedSnapshot, guestSnapshot, fullSnapshot] = await Promise.all([
      adminDb.collection("reservations").where("createdByAuthUid", "==", authUid).get(),
      adminDb.collection("reservations").where("createdBy.id", "==", authUid).get(),
      adminDb.collection("reservations").where("guestAccessUids", "array-contains", authUid).get(),
      adminDb.collection("reservations").get()
    ]);

    const mergedHistory = new Map<string, Record<string, any>>();
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
        mergedHistory.set(snapshotDoc.id, reservation);
      });
    });

    const reservations = Array.from(mergedHistory.values())
      .sort((a, b) => (toTimestamp(b.startDateTime) ?? 0) - (toTimestamp(a.startDateTime) ?? 0))
      .slice(0, limit);

    res.status(200).json({ reservations });
    return;
  }

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
};

export default async function handler(
  req: VercelRequestLike & {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  },
  res: VercelResponseLike
) {
  if (req.method === "POST") {
    try {
      await handleCreate(req, res);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || "No se pudo crear la reserva." });
    }
    return;
  }

  if (req.method === "GET") {
    try {
      await handleGet(req, res);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || "No se pudieron cargar las reservas." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
