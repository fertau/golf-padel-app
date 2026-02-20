import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";
import { recordGroupAuditEvent, resolveMemberName } from "../_lib/groupAudit.js";

type RenameGroupBody = {
  groupId?: string;
  name?: string;
};

const nowIso = () => new Date().toISOString();

export default async function handler(
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
