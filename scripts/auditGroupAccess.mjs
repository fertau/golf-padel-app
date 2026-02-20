import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
}

const targetAuthUid = process.argv[2]?.trim() || null;
const apply = process.argv.includes("--apply");

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();
const nowIso = () => new Date().toISOString();
const cleanArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];

const run = async () => {
  const groupsSnapshot = await db.collection("groups").get();
  const groups = groupsSnapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...(doc.data() ?? {}) }));

  console.log(`[auditGroupAccess] totalGroups=${groups.length} targetAuthUid=${targetAuthUid ?? "n/a"} apply=${apply}`);

  const updates = [];
  for (const group of groups) {
    const ownerAuthUid = typeof group.ownerAuthUid === "string" ? group.ownerAuthUid.trim() : "";
    const memberAuthUids = cleanArray(group.memberAuthUids);
    const adminAuthUids = cleanArray(group.adminAuthUids);
    const isDeleted = group.isDeleted === true;

    const isOwner = targetAuthUid ? ownerAuthUid === targetAuthUid : false;
    const isAdmin = targetAuthUid ? adminAuthUids.includes(targetAuthUid) : false;
    const isMember = targetAuthUid ? memberAuthUids.includes(targetAuthUid) : false;

    console.log(
      JSON.stringify({
        id: group.id,
        name: group.name,
        isDeleted,
        ownerAuthUid,
        memberCount: memberAuthUids.length,
        adminCount: adminAuthUids.length,
        isOwner,
        isAdmin,
        isMember
      })
    );

    if (!targetAuthUid) {
      continue;
    }

    const related = isOwner || isAdmin || isMember;
    if (!related) {
      continue;
    }

    const nextMembers = memberAuthUids.includes(targetAuthUid)
      ? memberAuthUids
      : [...memberAuthUids, targetAuthUid];
    const nextAdmins = ownerAuthUid
      ? Array.from(new Set([...adminAuthUids, ownerAuthUid]))
      : adminAuthUids;

    const needsFix =
      isDeleted ||
      nextMembers.length !== memberAuthUids.length ||
      nextAdmins.length !== adminAuthUids.length;

    if (needsFix) {
      updates.push({
        ref: group.ref,
        data: {
          isDeleted: false,
          memberAuthUids: nextMembers,
          adminAuthUids: nextAdmins,
          updatedAt: nowIso()
        }
      });
    }
  }

  if (apply && updates.length > 0) {
    const CHUNK = 400;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const batch = db.batch();
      updates.slice(i, i + CHUNK).forEach(({ ref, data }) => batch.update(ref, data));
      await batch.commit();
    }
  }

  console.log(
    `[auditGroupAccess] candidateFixes=${updates.length} applied=${apply ? updates.length : 0}`
  );
  if (updates.length > 0) {
    console.log(`[auditGroupAccess] candidateGroupIds=${updates.map((entry) => entry.ref.id).join(",")}`);
  }
};

run().catch((error) => {
  console.error("[auditGroupAccess] failed", error);
  process.exit(1);
});
