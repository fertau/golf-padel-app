import { randomUUID } from "crypto";
import { adminDb } from "./firebaseAdmin.js";

export type GroupAuditEventInput = {
  groupId: string;
  type:
    | "member_joined"
    | "member_removed"
    | "admin_granted"
    | "admin_revoked"
    | "group_renamed"
    | "reservation_owner_reassigned"
    | "reservation_created"
    | "reservation_updated"
    | "reservation_cancelled";
  actorAuthUid: string;
  actorName: string;
  targetAuthUid?: string;
  targetName?: string;
  metadata?: Record<string, string>;
};

const nowIso = () => new Date().toISOString();

export const resolveMemberName = (
  memberNamesByAuthUid: Record<string, string> | undefined,
  authUid: string,
  fallback = "Jugador"
) => {
  const direct = memberNamesByAuthUid?.[authUid]?.trim();
  if (direct) {
    return direct;
  }
  return fallback;
};

export const recordGroupAuditEvent = async (event: GroupAuditEventInput) => {
  const id = randomUUID();
  await adminDb.collection("groupAuditEvents").doc(id).set({
    id,
    groupId: event.groupId,
    type: event.type,
    actorAuthUid: event.actorAuthUid,
    actorName: event.actorName,
    targetAuthUid: event.targetAuthUid,
    targetName: event.targetName,
    metadata: event.metadata ?? {},
    createdAt: nowIso()
  });
};
