import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
}

const ownerAuthUid = process.argv[2]?.trim();
if (!ownerAuthUid) {
  console.error("Uso: node scripts/repairMiGrupoData.mjs <ownerAuthUid> [--all-missing]");
  process.exit(1);
}
const forceAllMissing = process.argv.includes("--all-missing");

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();
const nowIso = () => new Date().toISOString();
const normalize = (value) => (value ?? "").trim().toLowerCase();

const runBatchedUpdates = async (updates) => {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const slice = updates.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    slice.forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
};

const run = async () => {
  const groupsSnapshot = await db
    .collection("groups")
    .where("ownerAuthUid", "==", ownerAuthUid)
    .get();

  const groups = groupsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), ref: doc.ref }));
  const miGroups = groups.filter((group) => normalize(group.name) === "mi grupo");

  let canonical = null;
  if (miGroups.length > 0) {
    canonical = miGroups.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))[0];
  } else if (groups.length > 0) {
    canonical = groups.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))[0];
  } else {
    const groupRef = db.collection("groups").doc();
    canonical = {
      id: groupRef.id,
      name: "Mi grupo",
      ownerAuthUid,
      memberAuthUids: [ownerAuthUid],
      adminAuthUids: [ownerAuthUid],
      memberNamesByAuthUid: {},
      venueIds: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ref: groupRef
    };
    await groupRef.set(canonical);
  }

  if (normalize(canonical.name) !== "mi grupo") {
    await canonical.ref.update({ name: "Mi grupo", updatedAt: nowIso() });
  }

  const duplicateGroups = miGroups.filter((group) => group.id !== canonical.id);
  if (duplicateGroups.length > 0) {
    const duplicateUpdates = duplicateGroups.map((group, index) => ({
      ref: group.ref,
      data: {
        name: `Mi grupo (legacy ${index + 1})`,
        updatedAt: nowIso()
      }
    }));
    await runBatchedUpdates(duplicateUpdates);
  }

  const reservationsSnapshot = await db.collection("reservations").get();
  const duplicateIds = new Set(duplicateGroups.map((group) => group.id));
  const updates = [];

  reservationsSnapshot.docs.forEach((snapshotDoc) => {
    const reservation = snapshotDoc.data() ?? {};
    const signups = Array.isArray(reservation.signups) ? reservation.signups : [];

    const belongsToOwner =
      reservation.createdByAuthUid === ownerAuthUid ||
      reservation.createdBy?.id === ownerAuthUid ||
      signups.some((signup) => signup?.authUid === ownerAuthUid || signup?.userId === ownerAuthUid);

    const needsGroupBackfill =
      !reservation.groupId ||
      reservation.groupId === "default-group" ||
      duplicateIds.has(reservation.groupId);

    if (!belongsToOwner && !(forceAllMissing && needsGroupBackfill)) {
      return;
    }

    const data = {
      ...(needsGroupBackfill
        ? {
            groupId: canonical.id,
            groupName: "Mi grupo"
          }
        : {}),
      ...(!reservation.createdByAuthUid && reservation.createdBy?.id === ownerAuthUid
        ? {
            createdByAuthUid: ownerAuthUid
          }
        : {}),
      updatedAt: nowIso()
    };

    if (Object.keys(data).length > 1 || needsGroupBackfill) {
      updates.push({ ref: snapshotDoc.ref, data });
    }
  });

  if (updates.length > 0) {
    await runBatchedUpdates(updates);
  }

  console.log(
    `[repairMiGrupoData] owner=${ownerAuthUid} canonicalGroup=${canonical.id} renamedDuplicates=${duplicateGroups.length} updatedReservations=${updates.length}`
  );
};

run().catch((error) => {
  console.error("[repairMiGrupoData] failed", error);
  process.exit(1);
});
