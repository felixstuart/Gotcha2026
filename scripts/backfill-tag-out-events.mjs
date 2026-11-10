import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Rollout: deploy the tagOutEvents composite index and wait until it is ready.
// Pause eliminations, preview/apply this backfill, then deploy the updated functions
// and remove the old revenge/lastWords leaderboard triggers before resuming play.
// Existing leaderboard totals remain the baseline: imported events carry no score.
// Account for pending old score deliveries during the switch to avoid missing/double tags.
// Only current eliminations can be reconstructed; overwritten history is unavailable.
// Missing legacy timestamps use 0, so their exact order cannot be recovered.
// Dry-run by default; never infer the production project. --apply is safe to rerun.
const args = process.argv.slice(2);
const projectId = args[args.indexOf("--project") + 1];
if (!args.includes("--project") || !projectId || projectId.startsWith("--")) {
  throw new Error("Usage: node scripts/backfill-tag-out-events.mjs --project PROJECT [--apply]");
}
initializeApp({ projectId });
const db = getFirestore();
const apply = args.includes("--apply");
const profiles = await db.collection("data").where("alive", "==", false).get();
let count = 0;
for (const doc of profiles.docs) {
  const migrated = await db.runTransaction(async (tx) => {
    const profile = (await tx.get(doc.ref)).data();
    if (!profile || profile.alive || profile.activeTagOutEvent ||
        !profile.chaser || profile.chaser === "none") return false;
    const eventRef = db.doc(`tagOutEvents/legacy-${doc.id}`);
    if ((await tx.get(eventRef)).exists) return false;
    const words = (await tx.get(db.doc(`lastWords/${doc.id}`))).data();
    if (apply) {
      // No score: existing leaderboard totals must not be awarded again.
      tx.create(eventRef, {
        tagger: profile.chaser, victim: doc.id, active: true,
        timestamp: words?.timestamp ?? 0,
      });
      tx.update(doc.ref, { activeTagOutEvent: eventRef.id });
    }
    return true;
  });
  if (migrated) count++;
}
console.log(`${apply ? "Migrated" : "Would migrate"} ${count} current eliminations in ${projectId}.`);
await db.terminate();
