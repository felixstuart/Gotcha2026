import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { toAdminIndexRow } from "./shared/admin-index.cjs";

const root = fileURLToPath(new URL(".", import.meta.url));

// CSV exports can contain quoted commas, escaped quotes, and embedded newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, "");
  const cell = () => { row.push(field); field = ""; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ",") cell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      cell(); rows.push(row); row = [];
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (closed && /[ \t]/.test(c)) continue;
    else if (closed || c === '"') throw new Error("Malformed CSV quoting");
    else field += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  cell(); rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim()));
}

const clean = (value) => value.replace(/&#(?:x0*20|0*32);|&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const classNames = { "class i": "senior", "class ii": "junior", "class iii": "sophomore", "class iv": "freshman" };
// Official boarding houses: https://www.milton.edu/student-life/residential-houses
const dorms = new Set(["academy", "forbes", "goodwin", "hallowell", "hathaway", "millet", "norris", "robbins", "wolcott"]);

export function buildGame(text, seniorYear, shuffle = true, format = "auto") {
  const csv = format === "csv" || (format === "auto" && text.replace(/^\uFEFF/, "").split(/\r?\n/)[0].includes(","));
  const records = [];
  if (csv) {
    const [header = [], ...rows] = parseCsv(text);
    const headers = header.map((v) => clean(v).toLowerCase());
    const required = ["last", "first", "class", "daydorm", "email"];
    for (const name of required) {
      if (headers.filter((v) => v === name).length !== 1) throw new Error(`CSV needs exactly one ${name} column`);
    }
    for (const [i, row] of rows.entries()) {
      if (row.length !== headers.length) throw new Error(`CSV record ${i + 2}: wrong number of columns`);
      const get = (name) => clean(row[headers.indexOf(name)]);
      const classValue = get("class").toLowerCase();
      const schoolClass = classNames[classValue] ?? (classValue || "unknown");
      if (!["senior", "junior", "sophomore", "freshman", "unknown"].includes(schoolClass)) {
        throw new Error(`CSV record ${i + 2}: unrecognized Class ${get("class")}`);
      }
      const dormValue = get("daydorm").toLowerCase();
      const dorm = ["day student", "day"].includes(dormValue) ? "day" : dormValue.replace(/ house$/, "") || "unknown";
      if (!["day", "unknown"].includes(dorm) && !dorms.has(dorm)) throw new Error(`CSV record ${i + 2}: unrecognized DayDorm ${get("daydorm")}`);
      if (!get("first") || !get("last")) throw new Error(`CSV record ${i + 2}: First and Last are required`);
      records.push({ email: get("email").toLowerCase(), firstName: get("first"), lastName: get("last"), class: schoolClass, dayorboard: dorm });
    }
  } else {
    for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const email = raw.trim().toLowerCase();
      if (email && !email.startsWith("#")) records.push({ email });
    }
  }
  const emails = [];
  const seen = new Map();
  for (const record of records) {
    const { email } = record;
    if (!/^[a-z0-9][a-z0-9._+-]*@milton\.edu$/.test(email)) throw new Error(`Invalid school email: ${email}`);
    if (seen.has(email)) {
      if (JSON.stringify(seen.get(email)) !== JSON.stringify(record)) throw new Error(`Conflicting duplicate email: ${email}`);
      continue;
    }
    seen.set(email, record);
    emails.push(email);
  }
  if (emails.length < 2) throw new Error("Provide at least two distinct school emails");
  // Keep the entire game in one atomic commit, including the leaderboard.
  // Firestore removed the former 500-write transaction limit in March 2023.
  // Request-size/time limits still apply: https://docs.cloud.google.com/firestore/docs/release-notes#March_29_2023
  if (emails.length > 2000) throw new Error("Maximum 2000 players per atomic initial import");
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
      dayorboard: "unknown",
      ...seen.get(email),
    };
  });
  const profiles = people.map((person, i) => {
    const target = people[(i + 1) % people.length];
    return {
      email: person.email,
      profile: {
        firstName: person.firstName, lastName: person.lastName, class: person.class,
        dayorboard: person.dayorboard, role: "player", alive: true, tags: 0,
        chaser: people[(i - 1 + people.length) % people.length].email,
        target: { email: target.email, firstName: target.firstName, lastName: target.lastName },
      },
    };
  });
  return {
    profiles,
    leaderboard: {
      topTaggers: [...people].sort((a, b) => a.email.localeCompare(b.email)).slice(0, 10).map((p) => ({ email: p.email, name: `${p.firstName} ${p.lastName}`.trim(), tags: 0 })),
      byClass: [...new Set(people.map((p) => p.class))].map((value) => ({ class: value, tags: 0 })),
      byDorms: [...new Set(people.map((p) => p.dayorboard))].map((dorm) => ({ dorm, tags: 0 })), lastUpdated: Date.now(),
    },
  };
}

// Read existing roles and game guards in the import transaction, before any writes.
// Concurrent role changes force a retry. Admins retain access but never enter the loop.
export async function importGame(db, game) {
  await db.runTransaction(async (tx) => {
      const existing = await tx.get(db.collection("data"));
      const leaderboard = await tx.get(db.doc("leaderboard/main"));
      const lastWords = await tx.get(db.collection("lastWords").limit(1));
      if (existing.docs.some((doc) => doc.data().role !== "admin") || leaderboard.exists || !lastWords.empty) {
        throw new Error("Existing game found; initial import refused without changing any data");
      }
      const admins = new Set(existing.docs.map((doc) => doc.id));
      const players = game.profiles.filter(({ email }) => !admins.has(email));
      if (players.length < 2) throw new Error("Provide at least two non-admin players; no data changed");
      // Public leaderboard order must not reveal the private target loop.
      const indexRows = {};
      // Rebuild links after reading authoritative roles, preserving the shuffled order.
      for (const [i, { email, profile }] of players.entries()) {
        const next = players[(i + 1) % players.length];
        const saved = {
          ...profile,
          chaser: players[(i + players.length - 1) % players.length].email,
          target: { email: next.email, firstName: next.profile.firstName, lastName: next.profile.lastName },
        };
        indexRows[email] = toAdminIndexRow(saved);
        tx.create(db.doc(`data/${email}`), saved);
      }
      // Clear old seeded game links even for admins absent from this CSV.
      for (const doc of existing.docs) {
        const email = doc.id;
        indexRows[email] = toAdminIndexRow({ ...doc.data(), role: "admin", alive: false, chaser: "none", target: { email: "" } });
        tx.set(db.doc(`data/${email}`), {
          role: "admin", alive: false, chaser: "none",
          target: { email: "", firstName: "None", lastName: "" },
          activeTagOutEvent: FieldValue.delete(),
        }, { merge: true });
      }
      tx.set(db.doc("adminIndex/main"), { players: indexRows, updatedAt: Date.now() });
      tx.create(db.doc("leaderboard/main"), {
        ...game.leaderboard,
        topTaggers: [...players].sort((a, b) => a.email.localeCompare(b.email)).slice(0, 10).map(({ email, profile: p }) => ({ email, name: `${p.firstName} ${p.lastName}`, tags: 0 })),
        byClass: [...new Set(players.map(({ profile: p }) => p.class))].map((value) => ({ class: value, tags: 0 })),
        byDorms: [...new Set(players.map(({ profile: p }) => p.dayorboard))].map((dorm) => ({ dorm, tags: 0 })),
      });
    });
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
Reads "initial emails" by default, or --file roster.csv with Last,First,Class,DayDorm,Email headers.
CSV: Class I/II/III/IV -> senior/junior/sophomore/freshman; Day Student -> day; Goodwin House -> goodwin.
Blank CSV Class/DayDorm -> unknown; CSV names are preserved.
Blank lines and # comments are ignored; duplicate emails are combined.
  --file PATH          Use a different text file (relative to repository root)
  --dry-run            Validate and print assignments without database access
  --keep-order         Link players in file order instead of shuffling
  --senior-year YYYY   Graduation year of current seniors (defaults to school year)
  --project ID         Firebase project (local default: .firebaserc project)
  --production         Explicitly allow a real project using local Admin credentials
Local writes require FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (or your local port).
Creates 2–2000 members and a leaderboard atomically; refuses an existing game.
Existing admins stay admins, outside the player loop; at least two non-admin players are required.
No Auth accounts are created: members sign in with their own school Google account.`);
    return;
  }
  const now = new Date();
  const seniorYear = Number(values["senior-year"] ?? now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0));
  if (!Number.isInteger(seniorYear) || seniorYear < 2000 || seniorYear > 2100) {
    throw new Error("--senior-year must be a year from 2000 to 2100");
  }
  const game = buildGame(await readFile(resolve(root, values.file), "utf8"), seniorYear, !values["keep-order"], /\.csv$/i.test(values.file) ? "csv" : "auto");
  console.log(`${game.profiles.length} unique roster entries; senior graduation year ${seniorYear}.`);
  if (values["dry-run"]) {
    console.log("Offline preview: live admin roles are resolved and excluded from the loop during import.");
    console.table(game.profiles.map(({ email, profile: p }) => ({ email, firstName: p.firstName, lastName: p.lastName, class: p.class, dayorboard: p.dayorboard, chaser: p.chaser, target: p.target.email })));
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
    await importGame(db, game);
    console.log(`Imported roster (${game.profiles.length} entries); non-admin players linked in one closed loop and initialized leaderboard in ${projectId} (${host ?? "production"}).`);
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
