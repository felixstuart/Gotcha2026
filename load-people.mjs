import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = fileURLToPath(new URL(".", import.meta.url));

export function buildGame(text, seniorYear, shuffle = true) {
  const emails = [];
  const seen = new Set();
  for (const [index, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const email = raw.trim().toLowerCase();
    if (!email || email.startsWith("#")) continue;
    if (!/^[a-z0-9][a-z0-9._+-]*@milton\.edu$/.test(email)) {
      throw new Error(`Invalid school email on line ${index + 1}`);
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  if (emails.length < 2) throw new Error("Provide at least two distinct school emails");
  // Keep the entire game in one atomic commit, including the leaderboard.
  if (emails.length > 499) throw new Error("Maximum 499 players per atomic initial import");
  if (shuffle) {
    for (let i = emails.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [emails[i], emails[j]] = [emails[j], emails[i]];
    }
  }
  const title = (word) => word ? word[0].toUpperCase() + word.slice(1) : "";
  const people = emails.map((email) => {
    const local = email.split("@")[0];
    const year = local.match(/(\d{2}|\d{4})$/)?.[0];
    const graduation = year ? (year.length === 2 ? 2000 + Number(year) : Number(year)) : NaN;
    const names = local.replace(/\d+$/, "").split(/[._]+/).map(title);
    return {
      email, firstName: names[0], lastName: names.slice(1).join(" "),
      class: ["senior", "junior", "sophomore", "freshman"][graduation - seniorYear] ?? "unknown",
    };
  });
  const profiles = people.map((person, i) => {
    const target = people[(i + 1) % people.length];
    return {
      email: person.email,
      profile: {
        firstName: person.firstName, lastName: person.lastName, class: person.class,
        dayorboard: "unknown", role: "player", alive: true, tags: 0,
        chaser: people[(i - 1 + people.length) % people.length].email,
        target: { email: target.email, firstName: target.firstName, lastName: target.lastName },
      },
    };
  });
  return {
    profiles,
    leaderboard: {
      topTaggers: people.slice(0, 10).map((p) => ({ name: `${p.firstName} ${p.lastName}`.trim(), tags: 0 })),
      byClass: [...new Set(people.map((p) => p.class))].map((value) => ({ class: value, tags: 0 })),
      byDorms: [{ dorm: "unknown", tags: 0 }], lastUpdated: Date.now(),
    },
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    file: { type: "string", default: "initial emails" },
    project: { type: "string" },
    "senior-year": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "keep-order": { type: "boolean", default: false },
    production: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log(`Usage: npm run load:people -- [options]
Reads "initial emails" in the repository root: one @milton.edu email per line.
Blank lines and # comments are ignored; duplicate emails are combined.
  --file PATH          Use a different text file (relative to repository root)
  --dry-run            Validate and print assignments without database access
  --keep-order         Link players in file order instead of shuffling
  --senior-year YYYY   Graduation year of current seniors (defaults to school year)
  --project ID         Firebase project (local default: .firebaserc project)
  --production         Explicitly allow a real project using local Admin credentials
Local writes require FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (or your local port).
Creates 2–499 players and a leaderboard atomically; refuses an existing game.
No Auth accounts are created: members sign in with their own school Google account.`);
    return;
  }
  const now = new Date();
  const seniorYear = Number(values["senior-year"] ?? now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0));
  if (!Number.isInteger(seniorYear) || seniorYear < 2000 || seniorYear > 2100) {
    throw new Error("--senior-year must be a year from 2000 to 2100");
  }
  const game = buildGame(await readFile(resolve(root, values.file), "utf8"), seniorYear, !values["keep-order"]);
  console.log(`${game.profiles.length} unique players; senior graduation year ${seniorYear}; dorms unknown.`);
  if (values["dry-run"]) {
    console.table(game.profiles.map(({ email, profile: p }) => ({ email, class: p.class, chaser: p.chaser, target: p.target.email })));
    return;
  }
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (values.production) {
    if (host || !values.project || values.project.startsWith("demo-")) {
      throw new Error("Production requires --project with a real project ID and FIRESTORE_EMULATOR_HOST unset");
    }
  } else if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host ?? "")) {
    throw new Error("Set FIRESTORE_EMULATOR_HOST to a local emulator, or use --production --project ID");
  }
  const projectId = values.project ?? JSON.parse(await readFile(resolve(root, ".firebaserc"), "utf8")).projects.default;
  if (typeof projectId !== "string" || !projectId) throw new Error("Provide --project ID");
  const app = initializeApp({ projectId });
  try {
    const db = getFirestore(app);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(db.collection("data").limit(1));
      const leaderboard = await tx.get(db.doc("leaderboard/main"));
      const lastWords = await tx.get(db.collection("lastWords").limit(1));
      if (!existing.empty || leaderboard.exists || !lastWords.empty) {
        throw new Error("Existing game found; initial import refused without changing any data");
      }
      for (const { email, profile } of game.profiles) tx.create(db.doc(`data/${email}`), profile);
      tx.create(db.doc("leaderboard/main"), game.leaderboard);
    });
    console.log(`Loaded ${game.profiles.length} players in one closed loop and initialized leaderboard in ${projectId} (${host ?? "production"}).`);
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
