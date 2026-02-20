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
  console.error("Uso: node scripts/migrateReservationsToMiGrupo.mjs <ownerAuthUid>");
  process.exit(1);
}

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();

const nowIso = () => new Date().toISOString();

const run = async () => {
  let targetGroupId = "";
  const groupsSnapshot = await db
    .collection("groups")
    .where("ownerAuthUid", "==", ownerAuthUid)
    .limit(10)
    .get();

  const existingMiGrupo = groupsSnapshot.docs.find((doc) => {
    const data = doc.data();
    return (data.name ?? "").trim().toLowerCase() === "mi grupo";
  });

  if (existingMiGrupo) {
    targetGroupId = existingMiGrupo.id;
  } else if (!groupsSnapshot.empty) {
    const first = groupsSnapshot.docs[0];
    targetGroupId = first.id;
    await first.ref.update({
      name: "Mi grupo",
      updatedAt: nowIso()
    });
  } else {
    const groupRef = db.collection("groups").doc();
    targetGroupId = groupRef.id;
    await groupRef.set({
      id: targetGroupId,
      name: "Mi grupo",
      ownerAuthUid,
      memberAuthUids: [ownerAuthUid],
      adminAuthUids: [ownerAuthUid],
      memberNamesByAuthUid: {},
      venueIds: [],
      isDeleted: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  const reservationsSnapshot = await db.collection("reservations").get();
  let migrated = 0;

  const batch = db.batch();
  reservationsSnapshot.docs.forEach((snapshotDoc) => {
    const reservation = snapshotDoc.data();
    const signups = Array.isArray(reservation.signups) ? reservation.signups : [];
    const hasLegacyGroup = !reservation.groupId || reservation.groupId === "default-group";
    const relatedToOwner =
      reservation.createdByAuthUid === ownerAuthUid ||
      reservation.createdBy?.id === ownerAuthUid ||
      signups.some((signup) => signup.authUid === ownerAuthUid || signup.userId === ownerAuthUid);

    if (!hasLegacyGroup && !relatedToOwner) {
      return;
    }

    const updates = {
      groupId: targetGroupId,
      groupName: "Mi grupo",
      visibilityScope: "group",
      createdByAuthUid: reservation.createdByAuthUid || (reservation.createdBy?.id === ownerAuthUid ? ownerAuthUid : reservation.createdByAuthUid),
      updatedAt: nowIso()
    };
    batch.update(snapshotDoc.ref, updates);
    migrated += 1;
  });

  if (migrated > 0) {
    await batch.commit();
  }

  console.log(`[migrateReservationsToMiGrupo] owner=${ownerAuthUid} group=${targetGroupId} migrated=${migrated}`);
};

run().catch((error) => {
  console.error("[migrateReservationsToMiGrupo] failed", error);
  process.exit(1);
});
