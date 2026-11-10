import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Before deploying email-based leaderboard writes: pause score/admin changes and
// drain old score deliveries, preview/apply this migration, then deploy and resume.
// Rebuild top entries from profile IDs/totals: names cannot identify legacy entries.
// Dorm/class totals and event processing markers are preserved. Safe to rerun.
// Dry-run by default. Never infer a production project.
const args = process.argv.slice(2);
const projectId = args[args.indexOf("--project") + 1];
if (!args.includes("--project") || !projectId || projectId.startsWith("--")) {
  throw new Error("Usage: node scripts/migrate-leaderboard-emails.mjs --project PROJECT [--apply]");
}
initializeApp({ projectId });
const db = getFirestore();
const apply = args.includes("--apply");
const count = await db.runTransaction(async (tx) => {
  const ref = db.doc("leaderboard/main");
  if (!(await tx.get(ref)).exists) throw new Error("No leaderboard to migrate");
  const profiles = await tx.get(db.collection("data"));
  const topTaggers = profiles.docs.flatMap((doc) => {
    const p = doc.data();
    if (typeof p.tags !== "number" || !p.firstName || !p.lastName) return [];
    return [{ email: doc.id, name: `${p.firstName} ${p.lastName}`, tags: p.tags }];
  }).sort((a, b) => b.tags - a.tags || a.email.localeCompare(b.email)).slice(0, 10);
  if (apply) tx.update(ref, { topTaggers, lastUpdated: FieldValue.serverTimestamp() });
  return topTaggers.length;
});
console.log(`${apply ? "Migrated" : "Would migrate"} ${count} leaderboard entries in ${projectId}.`);
await db.terminate();
