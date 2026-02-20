import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";
import { recordGroupAuditEvent, resolveMemberName } from "../_lib/groupAudit.js";

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
  action?: "create";
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

type AttendanceStatus = "confirmed" | "maybe" | "cancelled";
type AttendanceReservationSignup = {
  id: string;
  reservationId: string;
  userId: string;
  authUid?: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
  attendanceStatus?: AttendanceStatus;
};

type AttendanceBody = {
  action: "attendance";
  reservationId?: string;
  status?: AttendanceStatus;
  currentUserName?: string;
};

type CancelBody = {
  action: "cancel";
  reservationId?: string;
};

type UpdateDetailsBody = {
  action: "update_details";
  reservationId?: string;
  courtName?: string;
  courtId?: string;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  startDateTime?: string;
  durationMinutes?: number;
  groupId?: string;
  groupName?: string;
  visibilityScope?: "group" | "link_only";
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

const isGroupMemberRecord = (group: Record<string, any>, authUid: string) => {
  const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
  const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
  return group.ownerAuthUid === authUid || adminAuthUids.includes(authUid) || memberAuthUids.includes(authUid);
};

const isGroupAdminRecord = (group: Record<string, any>, authUid: string) => {
  const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
  return group.ownerAuthUid === authUid || adminAuthUids.includes(authUid);
};

const isReservationCreatorRecord = (reservation: Record<string, any>, authUid: string) =>
  reservation.createdByAuthUid === authUid || reservation.createdBy?.id === authUid;

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

  const fallbackActorName = normalizeText(body.currentUserName) || `Jugador #${authUid.slice(-4).toUpperCase()}`;
  let actorName = fallbackActorName;
  let auditGroupId = "";
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
      memberNamesByAuthUid?: Record<string, string>;
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
    actorName = resolveMemberName(group.memberNamesByAuthUid, authUid, fallbackActorName);
    auditGroupId = targetGroupId;
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
      name: actorName
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

  if (requestedScope === "group" && auditGroupId) {
    await recordGroupAuditEvent({
      groupId: auditGroupId,
      type: "reservation_created",
      actorAuthUid: authUid,
      actorName,
      metadata: {
        reservationId,
        courtName: payload.courtName,
        startDateTime: payload.startDateTime
      }
    }).catch(() => null);
  }

  res.status(200).json({ ok: true, reservationId });
};

const handleAttendanceUpdate = async (
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) => {
  const authUid = await requireAuthUid(req);
  const body = parseBody<AttendanceBody>(req.body);
  const reservationId = normalizeText(body.reservationId);
  const nextStatus = body.status;
  const actorName = normalizeText(body.currentUserName) || `Jugador #${authUid.slice(-4).toUpperCase()}`;

  if (!reservationId || !nextStatus) {
    res.status(400).json({ error: "Faltan datos para actualizar asistencia." });
    return;
  }
  if (!["confirmed", "maybe", "cancelled"].includes(nextStatus)) {
    res.status(400).json({ error: "Estado de asistencia inválido." });
    return;
  }

  await adminDb.runTransaction(async (transaction) => {
    const reservationRef = adminDb.collection("reservations").doc(reservationId);
    const reservationSnapshot = await transaction.get(reservationRef);
    if (!reservationSnapshot.exists) {
      throw new Error("Reserva no encontrada.");
    }

    const reservation = reservationSnapshot.data() as {
      status?: string;
      groupId?: string;
      visibilityScope?: "group" | "link_only";
      createdByAuthUid?: string;
      createdBy?: { id?: string };
      guestAccessUids?: string[];
      signups?: AttendanceReservationSignup[];
    };

    if (reservation.status === "cancelled" && nextStatus !== "cancelled") {
      throw new Error("La reserva está cancelada.");
    }

    const scope = inferScope(reservation as Record<string, any>);
    if (scope === "group") {
      const groupId = reservation.groupId;
      if (!groupId || groupId === "default-group") {
        throw new Error("Reserva de grupo inválida.");
      }
      const groupSnapshot = await transaction.get(adminDb.collection("groups").doc(groupId));
      if (!groupSnapshot.exists) {
        throw new Error("Grupo no encontrado.");
      }
      const group = groupSnapshot.data() as Record<string, any>;
      if (group.isDeleted === true || !isGroupMemberRecord(group, authUid)) {
        throw new Error("No tenés permisos para confirmar en esta reserva.");
      }
    } else {
      const related = isRelatedToUser(reservation as Record<string, any>, authUid);
      if (!related) {
        throw new Error("No tenés permisos para confirmar en esta reserva.");
      }
    }

    const signups = Array.isArray(reservation.signups) ? reservation.signups : [];
    const existing = signups.find((signup) => signup.authUid === authUid || signup.userId === authUid);

    const nextSignups = existing
      ? signups.map((signup) =>
          signup.id === existing.id || signup.authUid === authUid || signup.userId === authUid
            ? {
                ...signup,
                userName: actorName,
                authUid,
                attendanceStatus: nextStatus,
                updatedAt: nowIso()
              }
            : signup
        )
      : [
          ...signups,
          {
            id: crypto.randomUUID(),
            reservationId,
            userId: authUid,
            authUid,
            userName: actorName,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            attendanceStatus: nextStatus
          }
        ];

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        signups: nextSignups,
        updatedAt: nowIso()
      })
    );
  });

  res.status(200).json({ ok: true });
};

const handleCancel = async (
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) => {
  const authUid = await requireAuthUid(req);
  const body = parseBody<CancelBody>(req.body);
  const reservationId = normalizeText(body.reservationId);
  if (!reservationId) {
    res.status(400).json({ error: "Falta reservationId." });
    return;
  }

  const fallbackActorName = `Jugador #${authUid.slice(-4).toUpperCase()}`;
  let actorName = fallbackActorName;
  let auditGroupId = "";

  await adminDb.runTransaction(async (transaction) => {
    const reservationRef = adminDb.collection("reservations").doc(reservationId);
    const reservationSnapshot = await transaction.get(reservationRef);
    if (!reservationSnapshot.exists) {
      throw new Error("Reserva no encontrada.");
    }
    const reservation = reservationSnapshot.data() as Record<string, any>;
    actorName = normalizeText(reservation.createdBy?.name) || fallbackActorName;

    let allowed = isReservationCreatorRecord(reservation, authUid);
    const scope = inferScope(reservation);
    if (scope === "group") {
      const groupId = reservation.groupId;
      if (groupId && groupId !== "default-group") {
        const groupSnapshot = await transaction.get(adminDb.collection("groups").doc(groupId));
        if (groupSnapshot.exists) {
          const group = groupSnapshot.data() as Record<string, any>;
          if (group.isDeleted !== true) {
            auditGroupId = groupId;
            actorName = resolveMemberName(group.memberNamesByAuthUid, authUid, actorName);
            if (!allowed) {
              allowed = isGroupAdminRecord(group, authUid);
            }
          }
        }
      }
    }
    if (!allowed) {
      throw new Error("Solo el creador o un admin del grupo puede cancelar.");
    }

    transaction.update(
      reservationRef,
      stripUndefinedDeep({
        status: "cancelled",
        updatedAt: nowIso()
      })
    );
  });

  if (auditGroupId) {
    await recordGroupAuditEvent({
      groupId: auditGroupId,
      type: "reservation_cancelled",
      actorAuthUid: authUid,
      actorName,
      metadata: {
        reservationId
      }
    }).catch(() => null);
  }

  res.status(200).json({ ok: true });
};

const handleUpdateDetails = async (
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) => {
  const authUid = await requireAuthUid(req);
  const body = parseBody<UpdateDetailsBody>(req.body);
  const reservationId = normalizeText(body.reservationId);
  if (!reservationId) {
    res.status(400).json({ error: "Falta reservationId." });
    return;
  }

  const fallbackActorName = `Jugador #${authUid.slice(-4).toUpperCase()}`;
  let actorName = fallbackActorName;
  let auditGroupId = "";

  await adminDb.runTransaction(async (transaction) => {
    const reservationRef = adminDb.collection("reservations").doc(reservationId);
    const reservationSnapshot = await transaction.get(reservationRef);
    if (!reservationSnapshot.exists) {
      throw new Error("Reserva no encontrada.");
    }

    const reservation = reservationSnapshot.data() as Record<string, any>;
    actorName = normalizeText(reservation.createdBy?.name) || fallbackActorName;
    let allowed = isReservationCreatorRecord(reservation, authUid);
    const currentScope = inferScope(reservation);
    let currentGroupForAudit = "";
    if (currentScope === "group") {
      const currentGroupId = reservation.groupId;
      if (currentGroupId && currentGroupId !== "default-group") {
        const currentGroupSnapshot = await transaction.get(adminDb.collection("groups").doc(currentGroupId));
        if (currentGroupSnapshot.exists) {
          const currentGroup = currentGroupSnapshot.data() as Record<string, any>;
          if (currentGroup.isDeleted !== true) {
            currentGroupForAudit = currentGroupId;
            actorName = resolveMemberName(currentGroup.memberNamesByAuthUid, authUid, actorName);
            if (!allowed) {
              allowed = isGroupAdminRecord(currentGroup, authUid);
            }
          }
        }
      }
    }
    if (!allowed) {
      throw new Error("Solo el creador o un admin del grupo puede editar.");
    }

    const nextVisibilityScope =
      body.visibilityScope === "group" || body.visibilityScope === "link_only"
        ? body.visibilityScope
        : inferScope({
            ...reservation,
            groupId: body.groupId ?? reservation.groupId
          });

    let nextGroupId: string = reservation.groupId ?? "default-group";
    let nextGroupName: string | undefined = reservation.groupName;

    if (nextVisibilityScope === "group") {
      const requestedGroupId = normalizeText(body.groupId) || normalizeText(reservation.groupId);
      if (!requestedGroupId || requestedGroupId === "default-group") {
        throw new Error("Seleccioná un grupo válido.");
      }

      const targetGroupSnapshot = await transaction.get(adminDb.collection("groups").doc(requestedGroupId));
      if (!targetGroupSnapshot.exists) {
        throw new Error("Grupo no encontrado.");
      }
      const targetGroup = targetGroupSnapshot.data() as Record<string, any>;
      if (targetGroup.isDeleted === true || !isGroupMemberRecord(targetGroup, authUid)) {
        throw new Error("No tenés permisos para mover la reserva a ese grupo.");
      }

      nextGroupId = requestedGroupId;
      nextGroupName = normalizeText(body.groupName) || normalizeText(targetGroup.name) || undefined;
      actorName = resolveMemberName(targetGroup.memberNamesByAuthUid, authUid, actorName);
    } else {
      nextGroupId = "default-group";
      nextGroupName = undefined;
    }

    const courtName = normalizeText(body.courtName) || normalizeText(reservation.courtName) || "Cancha a definir";
    const startDateTime = normalizeText(body.startDateTime) || normalizeText(reservation.startDateTime);
    const parsedStart = toTimestamp(startDateTime);
    if (!startDateTime || parsedStart === null) {
      throw new Error("Fecha/hora inválida.");
    }
    const durationMinutes =
      typeof body.durationMinutes === "number" && Number.isFinite(body.durationMinutes) && body.durationMinutes > 0
        ? Math.round(body.durationMinutes)
        : typeof reservation.durationMinutes === "number" && Number.isFinite(reservation.durationMinutes)
          ? reservation.durationMinutes
          : 90;

    const updateData: Record<string, unknown> = {
      courtName,
      courtId: normalizeText(body.courtId) || normalizeText(reservation.courtId) || undefined,
      venueId: normalizeText(body.venueId) || normalizeText(reservation.venueId) || undefined,
      venueName: normalizeText(body.venueName) || normalizeText(reservation.venueName) || undefined,
      venueAddress: normalizeText(body.venueAddress) || normalizeText(reservation.venueAddress) || undefined,
      startDateTime,
      durationMinutes,
      groupId: nextGroupId,
      visibilityScope: nextVisibilityScope,
      updatedAt: nowIso()
    };

    if (nextVisibilityScope === "group") {
      updateData.groupName = nextGroupName;
    } else {
      updateData.groupName = FieldValue.delete();
    }

    transaction.update(reservationRef, stripUndefinedDeep(updateData));
    auditGroupId = nextVisibilityScope === "group" ? nextGroupId : currentGroupForAudit;
  });

  if (auditGroupId) {
    await recordGroupAuditEvent({
      groupId: auditGroupId,
      type: "reservation_updated",
      actorAuthUid: authUid,
      actorName,
      metadata: {
        reservationId
      }
    }).catch(() => null);
  }

  res.status(200).json({ ok: true });
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
      const body = parseBody<{ action?: string }>(req.body);
      if (body.action === "attendance") {
        await handleAttendanceUpdate(req, res);
      } else if (body.action === "cancel") {
        await handleCancel(req, res);
      } else if (body.action === "update_details") {
        await handleUpdateDetails(req, res);
      } else {
        await handleCreate(req, res);
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || "No se pudo procesar la reserva." });
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
