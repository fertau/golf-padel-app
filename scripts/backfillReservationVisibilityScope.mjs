import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
}

const dryRun = process.argv.includes("--dry-run");

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();
const nowIso = () => new Date().toISOString();
const normalize = (value) => (value ?? "").trim().toLowerCase();
const isScope = (value) => value === "group" || value === "link_only";

const runBatchedUpdates = async (updates) => {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    updates.slice(i, i + CHUNK_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
};

const inferScope = (reservation) => {
  if (isScope(reservation.visibilityScope)) {
    return reservation.visibilityScope;
  }
  return reservation.groupId && reservation.groupId !== "default-group" ? "group" : "link_only";
};

const run = async () => {
  const [groupsSnapshot, reservationsSnapshot] = await Promise.all([
    db.collection("groups").get(),
    db.collection("reservations").get()
  ]);

  const groupsById = new Map();
  const groupsByMember = new Map();

  groupsSnapshot.docs.forEach((doc) => {
    const group = { id: doc.id, ...doc.data() };
    groupsById.set(group.id, group);
    const members = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
    members.forEach((authUid) => {
      const current = groupsByMember.get(authUid) ?? [];
      current.push(group);
      groupsByMember.set(authUid, current);
    });
  });

  for (const [authUid, groups] of groupsByMember.entries()) {
    groups.sort((a, b) => {
      const aIsMiGrupo = normalize(a.name) === "mi grupo" ? -1 : 0;
      const bIsMiGrupo = normalize(b.name) === "mi grupo" ? -1 : 0;
      if (aIsMiGrupo !== bIsMiGrupo) return aIsMiGrupo - bIsMiGrupo;
      return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    });
    groupsByMember.set(authUid, groups);
  }

  const updates = [];
  let migratedToGroup = 0;
  let normalizedToLinkOnly = 0;
  let visibilityFilled = 0;

  reservationsSnapshot.docs.forEach((snapshotDoc) => {
    const reservation = snapshotDoc.data() ?? {};
    const currentScope = inferScope(reservation);

    const rawGroupId = reservation.groupId;
    const hasGroupId = typeof rawGroupId === "string" && rawGroupId.length > 0;
    const hasValidGroup = hasGroupId && rawGroupId !== "default-group" && groupsById.has(rawGroupId);
    const isLegacyUngrouped = !hasGroupId || rawGroupId === "default-group";
    const explicitLinkOnly = reservation.visibilityScope === "link_only";
    const creatorAuthUid = reservation.createdByAuthUid || reservation.createdBy?.id || null;

    const data = {};
    let changed = false;

    if (!reservation.createdByAuthUid && reservation.createdBy?.id) {
      data.createdByAuthUid = reservation.createdBy.id;
      changed = true;
    }

    if (hasValidGroup) {
      const group = groupsById.get(rawGroupId);
      if (reservation.groupName !== group.name) {
        data.groupName = group.name;
        changed = true;
      }
      if (currentScope !== "group") {
        data.visibilityScope = "group";
        visibilityFilled += 1;
        changed = true;
      }
      if (changed) {
        updates.push({ ref: snapshotDoc.ref, data: { ...data, updatedAt: nowIso() } });
      }
      return;
    }

    if (isLegacyUngrouped && !explicitLinkOnly && creatorAuthUid) {
      const fallbackGroup = (groupsByMember.get(creatorAuthUid) ?? [])[0] ?? null;
      if (fallbackGroup) {
        if (reservation.groupId !== fallbackGroup.id) {
          data.groupId = fallbackGroup.id;
          changed = true;
        }
        if (reservation.groupName !== fallbackGroup.name) {
          data.groupName = fallbackGroup.name;
          changed = true;
        }
        if (currentScope !== "group") {
          data.visibilityScope = "group";
          visibilityFilled += 1;
          changed = true;
        }
        if (changed) {
          migratedToGroup += 1;
          updates.push({ ref: snapshotDoc.ref, data: { ...data, updatedAt: nowIso() } });
        }
        return;
      }
    }

    if (currentScope !== "link_only") {
      data.visibilityScope = "link_only";
      visibilityFilled += 1;
      changed = true;
    }
    if (changed) {
      normalizedToLinkOnly += 1;
      updates.push({ ref: snapshotDoc.ref, data: { ...data, updatedAt: nowIso() } });
    }
  });

  if (!dryRun && updates.length > 0) {
    await runBatchedUpdates(updates);
  }

  console.log(
    `[backfillReservationVisibilityScope] dryRun=${dryRun} reservations=${reservationsSnapshot.size} updates=${updates.length} migratedToGroup=${migratedToGroup} normalizedToLinkOnly=${normalizedToLinkOnly} visibilityFilled=${visibilityFilled}`
  );
};

run().catch((error) => {
  console.error("[backfillReservationVisibilityScope] failed", error);
  process.exit(1);
});
