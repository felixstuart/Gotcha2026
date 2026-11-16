import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// All current game paths are flat (schema.ts). Keep admin documents, Auth users,
// config/game and adminLog. Read everything before scheduling any deletes; the
// transaction retries if an admin promotion or game write races the reset.
export async function resetPlayers(db, apply = false) {
  return db.runTransaction(async (tx) => {
    const profiles = await tx.get(db.collection("data"));
    const lastWords = await tx.get(db.collection("lastWords"));
    const events = await tx.get(db.collection("tagOutEvents"));
    const leaderboard = await tx.get(db.doc("leaderboard/main"));
    const cache = await tx.get(db.doc("lastWordsIndex/main"));
    const index = await tx.get(db.doc("adminIndex/main"));
    const admins = new Set(profiles.docs.filter((doc) => doc.data().role === "admin").map((doc) => doc.id));
    const removed = profiles.docs.filter((doc) => !admins.has(doc.id));
    const deletes = [...removed, ...lastWords.docs, ...events.docs, ...[leaderboard, cache].filter((doc) => doc.exists)];
    const summary = {
      mode: apply ? "APPLIED" : "PREVIEW: no changes",
      adminsKept: admins.size,
      nonAdminProfilesDeleted: removed.length,
      lastWordsDeleted: lastWords.size,
      tagOutEventsDeleted: events.size,
      leaderboardDeleted: leaderboard.exists,
      lastWordsCacheDeleted: cache.exists,
      adminIndexPruned: index.exists,
    };
    if (apply) {
      for (const doc of deletes) tx.delete(doc.ref);
      if (index.exists) {
        const rows = Object.entries(index.data().players ?? {}).filter(([email]) => admins.has(email));
        tx.set(index.ref, { players: Object.fromEntries(rows), updatedAt: Date.now() });
      }
    }
    return summary;
  });
}

async function main() {
  const { values } = parseArgs({ options: {
    project: { type: "string" }, production: { type: "boolean", default: false },
    apply: { type: "boolean", default: false }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log(`Usage: npm run reset:players -- --production --project ID [--apply]
Preview by default; --apply clears non-admin profiles, leaderboard, last words,
elimination events and the last-words cache, and removes non-admin index rows.
Preserves admin profiles, Firebase Auth accounts/claims, settings and audit logs.
Run while gameplay is paused, then import your roster. Deletes cannot be undone.
Local use requires --project ID and FIRESTORE_EMULATOR_HOST pointing to localhost.`);
    return;
  }
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!values.project) throw new Error("Provide --project ID");
  if (values.production) {
    if (host || values.project.startsWith("demo-")) throw new Error("Production requires a real --project and FIRESTORE_EMULATOR_HOST unset");
  } else if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host ?? "")) {
    throw new Error("Use --production --project ID, or set a local FIRESTORE_EMULATOR_HOST");
  }
  const app = initializeApp({ projectId: values.project });
  try {
    console.log(`Project: ${values.project} (${host ?? "LIVE"})`);
    console.table(await resetPlayers(getFirestore(app), values.apply));
  } finally { await deleteApp(app); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
