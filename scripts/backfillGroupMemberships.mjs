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

const normalizeAuthUidArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];

const appendUnique = (base, additions) => {
  const next = [...base];
  additions.forEach((item) => {
    if (!item || next.includes(item)) return;
    next.push(item);
  });
  return next;
};

const arraysEqual = (left, right) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const runBatches = async (updates) => {
  const CHUNK_SIZE = 400;
  for (let index = 0; index < updates.length; index += CHUNK_SIZE) {
    const batch = db.batch();
    updates.slice(index, index + CHUNK_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
};

const run = async () => {
  const groupsSnapshot = await db.collection("groups").get();
  const updates = [];

  groupsSnapshot.docs.forEach((snapshotDoc) => {
    const group = snapshotDoc.data() ?? {};
    if (group.isDeleted === true) {
      return;
    }

    const ownerAuthUid =
      typeof group.ownerAuthUid === "string" && group.ownerAuthUid.trim().length > 0
        ? group.ownerAuthUid.trim()
        : null;
    const memberAuthUids = normalizeAuthUidArray(group.memberAuthUids);
    const adminAuthUids = normalizeAuthUidArray(group.adminAuthUids);
    const namedMemberAuthUids =
      group.memberNamesByAuthUid && typeof group.memberNamesByAuthUid === "object"
        ? Object.keys(group.memberNamesByAuthUid).filter((authUid) => typeof authUid === "string" && authUid.trim())
        : [];

    const nextMemberAuthUids = appendUnique(
      appendUnique(memberAuthUids, namedMemberAuthUids),
      appendUnique(adminAuthUids, ownerAuthUid ? [ownerAuthUid] : [])
    );
    const nextAdminAuthUids = appendUnique(adminAuthUids, ownerAuthUid ? [ownerAuthUid] : []).filter((authUid) =>
      nextMemberAuthUids.includes(authUid)
    );

    if (arraysEqual(memberAuthUids, nextMemberAuthUids) && arraysEqual(adminAuthUids, nextAdminAuthUids)) {
      return;
    }

    updates.push({
      ref: snapshotDoc.ref,
      data: {
        memberAuthUids: nextMemberAuthUids,
        adminAuthUids: nextAdminAuthUids,
        updatedAt: nowIso()
      }
    });
  });

  if (!dryRun && updates.length > 0) {
    await runBatches(updates);
  }

  console.log(
    `[backfillGroupMemberships] dryRun=${dryRun} totalGroups=${groupsSnapshot.size} updates=${updates.length}`
  );
  if (updates.length > 0) {
    console.log(`[backfillGroupMemberships] updatedGroupIds=${updates.map((entry) => entry.ref.id).join(",")}`);
  }
};

run().catch((error) => {
  console.error("[backfillGroupMemberships] failed", error);
  process.exit(1);
});
