import { adminDb } from "../_lib/firebaseAdmin.js";
import { requireAuthUid } from "../_lib/auth.js";
import type { VercelRequestLike, VercelResponseLike } from "../_lib/http.js";

const normalizeGroup = (docId: string, data: Record<string, unknown>) => ({
  id: docId,
  ...data,
  memberAuthUids: Array.isArray(data.memberAuthUids) ? data.memberAuthUids : [],
  adminAuthUids: Array.isArray(data.adminAuthUids) ? data.adminAuthUids : [],
  memberNamesByAuthUid:
    data.memberNamesByAuthUid && typeof data.memberNamesByAuthUid === "object" ? data.memberNamesByAuthUid : {},
  venueIds: Array.isArray(data.venueIds) ? data.venueIds : [],
  isDeleted: data.isDeleted === true
});

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
