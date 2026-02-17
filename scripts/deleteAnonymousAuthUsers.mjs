import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const serviceAccountPath = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!serviceAccountPath) {
  console.error(
    "Uso: node scripts/deleteAnonymousAuthUsers.mjs <ruta-service-account.json> [--dry-run]"
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

const isAnonymousUser = (user) =>
  user.providerData.length === 0 && !user.email && !user.phoneNumber;

async function main() {
  let pageToken;
  let totalScanned = 0;
  let totalAnonymous = 0;
  let totalDeleted = 0;

  do {
    const result = await auth.listUsers(1000, pageToken);
    pageToken = result.pageToken;
    totalScanned += result.users.length;

    const anonymousUids = result.users.filter(isAnonymousUser).map((u) => u.uid);
    totalAnonymous += anonymousUids.length;

    if (!dryRun && anonymousUids.length > 0) {
      const deleteResult = await auth.deleteUsers(anonymousUids);
      totalDeleted += deleteResult.successCount;

      if (deleteResult.failureCount > 0) {
        console.warn("Algunos usuarios no se pudieron borrar:", deleteResult.errors);
      }
    }
  } while (pageToken);

  console.log(
    JSON.stringify(
      {
        dryRun,
        totalScanned,
        totalAnonymous,
        totalDeleted
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Error ejecutando borrado de anónimos:", error);
  process.exit(1);
});
