import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
}

const apply = process.argv.includes("--apply");

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();
const normalize = (value) => (value ?? "").trim().toLowerCase();

const run = async () => {
  const [groupsSnapshot, reservationsSnapshot] = await Promise.all([
    db.collection("groups").get(),
    db.collection("reservations").get()
  ]);

  const reservationsByGroupId = new Map();
  reservationsSnapshot.docs.forEach((doc) => {
    const reservation = doc.data() ?? {};
    const groupId = reservation.groupId;
    if (!groupId || typeof groupId !== "string") return;
    reservationsByGroupId.set(groupId, (reservationsByGroupId.get(groupId) ?? 0) + 1);
  });

  const candidates = groupsSnapshot.docs.filter((doc) => {
    const group = doc.data() ?? {};
    if (group.isDeleted === true) return false;
    if (normalize(group.name) !== "mi grupo") return false;

    const ownerAuthUid = group.ownerAuthUid;
    const members = Array.isArray(group.memberAuthUids) ? group.memberAuthUids : [];
    const admins = Array.isArray(group.adminAuthUids) ? group.adminAuthUids : [];
    if (!ownerAuthUid || members.length !== 1 || admins.length !== 1) return false;
    if (members[0] !== ownerAuthUid || admins[0] !== ownerAuthUid) return false;

    const reservationCount = reservationsByGroupId.get(doc.id) ?? 0;
    if (reservationCount > 0) return false;

    return true;
  });

  if (apply && candidates.length > 0) {
    const batch = db.batch();
    candidates.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  console.log(
    `[cleanupForcedMiGrupo] apply=${apply} totalGroups=${groupsSnapshot.size} forcedCandidates=${candidates.length} deleted=${apply ? candidates.length : 0}`
  );
  if (candidates.length > 0) {
    console.log(
      `[cleanupForcedMiGrupo] candidateIds=${candidates.map((doc) => doc.id).join(",")}`
    );
  }
};

run().catch((error) => {
  console.error("[cleanupForcedMiGrupo] failed", error);
  process.exit(1);
});
