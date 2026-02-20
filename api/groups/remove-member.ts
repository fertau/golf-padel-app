import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import { parseBody, type VercelRequestLike, type VercelResponseLike } from "../_lib/http.js";

type RemoveMemberBody = {
  groupId?: string;
  targetAuthUid?: string;
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
    const body = parseBody<RemoveMemberBody>(req.body);
    const groupId = body.groupId?.trim();
    const targetAuthUid = body.targetAuthUid?.trim();

    if (!groupId || !targetAuthUid) {
      res.status(400).json({ error: "Faltan datos para quitar miembro." });
      return;
    }

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
