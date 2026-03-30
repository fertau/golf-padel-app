import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./_lib/firebaseAdmin.js";
import { requireAuthUid } from "./_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "./_lib/http.js";
import { recordGroupAuditEvent, resolveMemberName } from "./_lib/groupAudit.js";

// ── Types ────────────────────────────────────────────────────────────────────

type RemoveMemberBody = {
  groupId?: string;
  targetAuthUid?: string;
};

type RenameGroupBody = {
  groupId?: string;
  name?: string;
};

type SetAdminBody = {
  groupId?: string;
  targetAuthUid?: string;
  makeAdmin?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseQueryValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const nowIso = () => new Date().toISOString();

const normalizeGroup = (docId: string, data: Record<string, unknown>) => ({
  id: docId,
  ...data,
  name: (typeof data.name === "string" ? data.name : "") as string,
  memberAuthUids: Array.isArray(data.memberAuthUids) ? data.memberAuthUids : [],
  adminAuthUids: Array.isArray(data.adminAuthUids) ? data.adminAuthUids : [],
  memberNamesByAuthUid:
    data.memberNamesByAuthUid && typeof data.memberNamesByAuthUid === "object" ? data.memberNamesByAuthUid : {},
  venueIds: Array.isArray(data.venueIds) ? data.venueIds : [],
  isDeleted: data.isDeleted === true
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleList(
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

    const merged = new Map<string, ReturnType<typeof normalizeGroup>>();
    [memberSnapshot, ownerSnapshot, adminSnapshot].forEach((snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        merged.set(snapshotDoc.id, normalizeGroup(snapshotDoc.id, snapshotDoc.data() ?? {}));
      });
    });

    const groups = Array.from(merged.values())
      .filter((group) => !group.isDeleted)
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", { sensitivity: "base" }));

    res.status(200).json({ groups });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudieron cargar los grupos." });
  }
}

async function handleAudit(
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
    const groupId = parseQueryValue(req.query?.groupId)?.trim();
    const rawLimit = Number.parseInt(parseQueryValue(req.query?.limit) ?? "30", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

    if (!groupId) {
      res.status(400).json({ error: "Falta groupId." });
      return;
    }

    const groupSnapshot = await adminDb.collection("groups").doc(groupId).get();
    if (!groupSnapshot.exists) {
      res.status(404).json({ error: "Grupo no encontrado." });
      return;
    }

    const group = groupSnapshot.data() as {
      ownerAuthUid?: string;
      adminAuthUids?: string[];
      memberAuthUids?: string[];
      isDeleted?: boolean;
    };
    if (group.isDeleted === true) {
      res.status(404).json({ error: "Grupo no encontrado." });
      return;
    }

    const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
    const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
    const allowed =
      group.ownerAuthUid === authUid || adminAuthUids.includes(authUid) || memberAuthUids.includes(authUid);
    if (!allowed) {
      res.status(403).json({ error: "No tenés permisos para ver la actividad de este grupo." });
      return;
    }

    const snapshot = await adminDb.collection("groupAuditEvents").where("groupId", "==", groupId).limit(200).get();

    const events = snapshot.docs
      .map((snapshotDoc) => ({ id: snapshotDoc.id, ...(snapshotDoc.data() ?? {}) } as Record<string, unknown>))
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
      .slice(0, limit);
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "No se pudo cargar la actividad del grupo." });
  }
}

async function handleRemoveMember(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actorAuthUid = await requireAuthUid(req);
    const body = parseBody<RemoveMemberBody>(req.body);
    const groupId = body.groupId?.trim();
    const targetAuthUid = body.targetAuthUid?.trim();

    if (!groupId || !targetAuthUid) {
      res.status(400).json({ error: "Faltan datos para quitar miembro." });
      return;
    }

    let actorName = "Admin";
    let targetName = "Miembro";

    await adminDb.runTransaction(async (transaction) => {
      const groupRef = adminDb.collection("groups").doc(groupId);
      const groupSnapshot = await transaction.get(groupRef);
      if (!groupSnapshot.exists) {
        throw new Error("Grupo no encontrado.");
      }

      const group = groupSnapshot.data() as {
        ownerAuthUid?: string;
        adminAuthUids?: string[];
        memberAuthUids?: string[];
        memberNamesByAuthUid?: Record<string, string>;
        isDeleted?: boolean;
      };

      if (group.isDeleted === true) {
        throw new Error("El grupo ya no está disponible.");
      }

      const ownerAuthUid = group.ownerAuthUid ?? "";
      const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
      const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];

      const actorIsAdmin = ownerAuthUid === actorAuthUid || adminAuthUids.includes(actorAuthUid);
      if (!actorIsAdmin) {
        throw new Error("Solo administradores pueden quitar miembros.");
      }

      if (ownerAuthUid === targetAuthUid) {
        throw new Error("No podés quitar al admin principal.");
      }
      if (!memberAuthUids.includes(targetAuthUid)) {
        throw new Error("El usuario no es miembro del grupo.");
      }

      actorName = resolveMemberName(group.memberNamesByAuthUid, actorAuthUid, "Admin");
      targetName = resolveMemberName(group.memberNamesByAuthUid, targetAuthUid, "Miembro");

      const nextMembers = memberAuthUids.filter((authUid) => authUid !== targetAuthUid);
      const nextAdmins = Array.from(new Set(adminAuthUids.filter((authUid) => authUid !== targetAuthUid).concat(ownerAuthUid)));
      if (nextAdmins.length === 0) {
        throw new Error("El grupo debe tener al menos un admin.");
      }

      transaction.update(groupRef, {
        memberAuthUids: nextMembers,
        adminAuthUids: nextAdmins,
        [`memberNamesByAuthUid.${targetAuthUid}`]: FieldValue.delete(),
        updatedAt: nowIso()
      });
    });

    await recordGroupAuditEvent({
      groupId,
      type: "member_removed",
      actorAuthUid,
      actorName,
      targetAuthUid,
      targetName
    }).catch(() => null);

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = (error as Error).message || "No se pudo quitar al miembro.";
    const isValidationError =
      message.includes("administradores") ||
      message.includes("principal") ||
      message.includes("no es miembro") ||
      message.includes("no encontrado") ||
      message.includes("disponible");
    res.status(isValidationError ? 400 : 500).json({ error: message });
  }
}

async function handleRename(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actorAuthUid = await requireAuthUid(req);
    const body = parseBody<RenameGroupBody>(req.body);
    const groupId = body.groupId?.trim();
    const name = body.name?.trim();

    if (!groupId || !name) {
      res.status(400).json({ error: "Faltan datos para renombrar grupo." });
      return;
    }

    let previousName = "";
    let actorName = "Admin";

    await adminDb.runTransaction(async (transaction) => {
      const groupRef = adminDb.collection("groups").doc(groupId);
      const groupSnapshot = await transaction.get(groupRef);
      if (!groupSnapshot.exists) {
        throw new Error("Grupo no encontrado.");
      }
      const group = groupSnapshot.data() as {
        name?: string;
        ownerAuthUid?: string;
        adminAuthUids?: string[];
        memberNamesByAuthUid?: Record<string, string>;
        isDeleted?: boolean;
      };
      if (group.isDeleted === true) {
        throw new Error("El grupo ya no está disponible.");
      }
      const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
      const actorIsAdmin = group.ownerAuthUid === actorAuthUid || adminAuthUids.includes(actorAuthUid);
      if (!actorIsAdmin) {
        throw new Error("Solo administradores pueden renombrar el grupo.");
      }

      previousName = group.name?.trim() || "";
      actorName = resolveMemberName(group.memberNamesByAuthUid, actorAuthUid, "Admin");

      transaction.update(groupRef, {
        name,
        updatedAt: nowIso()
      });
    });

    const reservationsSnapshot = await adminDb.collection("reservations").where("groupId", "==", groupId).get();
    if (!reservationsSnapshot.empty) {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < reservationsSnapshot.docs.length; i += CHUNK_SIZE) {
        const batch = adminDb.batch();
        reservationsSnapshot.docs.slice(i, i + CHUNK_SIZE).forEach((snapshotDoc) => {
          batch.update(snapshotDoc.ref, {
            groupName: name,
            updatedAt: nowIso()
          });
        });
        await batch.commit();
      }
    }

    await recordGroupAuditEvent({
      groupId,
      type: "group_renamed",
      actorAuthUid,
      actorName,
      metadata: {
        previousName,
        newName: name
      }
    }).catch(() => null);

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = (error as Error).message || "No se pudo renombrar el grupo.";
    const isValidationError =
      message.includes("administradores") ||
      message.includes("no encontrado") ||
      message.includes("disponible");
    res.status(isValidationError ? 400 : 500).json({ error: message });
  }
}

async function handleSetAdmin(
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> },
  res: VercelResponseLike
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actorAuthUid = await requireAuthUid(req);
    const body = parseBody<SetAdminBody>(req.body);
    const groupId = body.groupId?.trim();
    const targetAuthUid = body.targetAuthUid?.trim();
    const makeAdmin = body.makeAdmin === true;

    if (!groupId || !targetAuthUid) {
      res.status(400).json({ error: "Faltan datos para actualizar rol." });
      return;
    }

    let actorName = "Admin";
    let targetName = "Miembro";

    await adminDb.runTransaction(async (transaction) => {
      const groupRef = adminDb.collection("groups").doc(groupId);
      const groupSnapshot = await transaction.get(groupRef);
      if (!groupSnapshot.exists) {
        throw new Error("Grupo no encontrado.");
      }

      const group = groupSnapshot.data() as {
        ownerAuthUid?: string;
        adminAuthUids?: string[];
        memberAuthUids?: string[];
        memberNamesByAuthUid?: Record<string, string>;
        isDeleted?: boolean;
      };

      if (group.isDeleted === true) {
        throw new Error("El grupo ya no está disponible.");
      }

      const ownerAuthUid = group.ownerAuthUid ?? "";
      const adminAuthUids = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
      const memberAuthUids = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];

      const actorIsAdmin = ownerAuthUid === actorAuthUid || adminAuthUids.includes(actorAuthUid);
      if (!actorIsAdmin) {
        throw new Error("Solo administradores pueden gestionar roles.");
      }
      if (!memberAuthUids.includes(targetAuthUid)) {
        throw new Error("El usuario no es miembro del grupo.");
      }

      actorName = resolveMemberName(group.memberNamesByAuthUid, actorAuthUid, "Admin");
      targetName = resolveMemberName(group.memberNamesByAuthUid, targetAuthUid, "Miembro");
      if (ownerAuthUid === targetAuthUid) {
        throw new Error("El admin principal siempre mantiene permisos.");
      }

      const nextAdmins = makeAdmin
        ? Array.from(new Set([...adminAuthUids, targetAuthUid, ownerAuthUid]))
        : Array.from(new Set(adminAuthUids.filter((authUid) => authUid !== targetAuthUid).concat(ownerAuthUid)));
      if (nextAdmins.length === 0) {
        throw new Error("El grupo debe tener al menos un admin.");
      }

      transaction.update(groupRef, {
        adminAuthUids: nextAdmins,
        updatedAt: nowIso()
      });
    });

    await recordGroupAuditEvent({
      groupId,
      type: makeAdmin ? "admin_granted" : "admin_revoked",
      actorAuthUid,
      actorName,
      targetAuthUid,
      targetName
    }).catch(() => null);

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = (error as Error).message || "No se pudo actualizar el rol.";
    const isValidationError =
      message.includes("administradores") ||
      message.includes("principal") ||
      message.includes("no es miembro") ||
      message.includes("no encontrado") ||
      message.includes("disponible");
    res.status(isValidationError ? 400 : 500).json({ error: message });
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequestLike & {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
  },
  res: VercelResponseLike
) {
  const action = (Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action) as string | undefined;

  switch (action) {
    case "list":
      return handleList(req, res);
    case "audit":
      return handleAudit(req, res);
    case "remove-member":
      return handleRemoveMember(req, res);
    case "rename":
      return handleRename(req, res);
    case "set-admin":
      return handleSetAdmin(req, res);
    default:
      res.status(400).json({ error: "Unknown action. Use ?action=list|audit|remove-member|rename|set-admin" });
  }
}
