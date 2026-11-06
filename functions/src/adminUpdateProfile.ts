import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";
import {
  AdminIndex,
  AdminIndexRow,
  AdminProfileChanges,
  EditableProfileFields,
  Leaderboard,
  Profile,
  Role,
} from "../../types";
import { requireAdmin } from "./auth";
import { ADMIN_INDEX_PATH, logAdminAction, toAdminIndexRow } from "./adminIndex";
import { Chain } from "./chain";

const ROLES: Role[] = ["admin", "player", "observer"];

/** Checks each value's type and drops anything that can't be edited */
function parseChanges(raw: unknown): AdminProfileChanges {
  if (typeof raw !== "object" || raw === null) {
    throw new HttpsError("invalid-argument", "changes must be an object");
  }

  const input = raw as Record<string, unknown>;
  const changes: AdminProfileChanges = {};

  for (const field of ["firstName", "lastName", "class", "dayorboard"] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "string" || input[field] === "") {
      throw new HttpsError("invalid-argument", `${field} must be a non-empty string`);
    }
    changes[field] = input[field] as string;
  }

  if (input.role !== undefined) {
    if (!ROLES.includes(input.role as Role)) {
      throw new HttpsError("invalid-argument", `role must be one of ${ROLES.join(", ")}`);
    }
    changes.role = input.role as Role;
  }

  if (input.tags !== undefined) {
    if (!Number.isInteger(input.tags) || (input.tags as number) < 0) {
      throw new HttpsError("invalid-argument", "tags must be a whole number >= 0");
    }
    changes.tags = input.tags as number;
  }

  if (input.alive !== undefined) {
    if (typeof input.alive !== "boolean") {
      throw new HttpsError("invalid-argument", "alive must be true or false");
    }
    changes.alive = input.alive;
  }

  for (const field of ["chaser", "targetEmail"] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "string" || input[field] === "" || input[field] === "none") {
      throw new HttpsError("invalid-argument", `${field} must be a player's email`);
    }
    changes[field] = input[field] as string;
  }

  return changes;
}

/**
 * Rebuilds topTaggers from every player in the admin index, with the edited player's new values.
 * This is what lets the next-best player move up when a top tagger's tags go down.
 *
 * The index can lag a second behind a tag out (it's updated by a trigger), while the leaderboard
 * is updated in the same transaction as every tag. So for anyone already on the leaderboard,
 * its count wins; the index only fills in everyone else.
 */
function topTaggersFromIndex(
  leaderboard: Leaderboard,
  rows: Record<string, AdminIndexRow>,
  email: string,
  after: Profile,
): Leaderboard["topTaggers"] {
  const current = new Map(leaderboard.topTaggers.map((tagger) => [tagger.name, tagger.tags]));
  const edited = { name: `${after.firstName} ${after.lastName}`, tags: after.tags };

  const candidates = Object.entries(rows)
    .filter(([rowEmail]) => rowEmail !== email)
    .map(([, row]) => {
      const name = `${row.firstName} ${row.lastName}`;
      return { name, tags: current.get(name) ?? row.tags };
    })
    .concat([edited]);

  return candidates
    .sort((a, b) => b.tags - a.tags || a.name.localeCompare(b.name))
    .slice(0, leaderboard.topTaggers.length);
}

/**
 * Works out how an edit changes the leaderboard:
 * - byDorms / byClass: the player's tags move out of their old bucket and into the new one,
 *   the same incremental way updateLeaderboard does
 *   (only buckets already on the leaderboard count, like in updateLeaderboard)
 * - topTaggers: rebuilt from the admin index (see topTaggersFromIndex). If the index hasn't
 *   been built yet, the player's entry is just renamed / re-scored, and added if they now
 *   qualify, so a top tagger losing tags won't pull the next-best player in.
 * Returns null if nothing on the leaderboard changes.
 */
function leaderboardUpdates(
  leaderboard: Leaderboard,
  before: Profile,
  after: Profile,
  email: string,
  indexRows: Record<string, AdminIndexRow> | null,
): Partial<Leaderboard> | null {
  const updates: Partial<Leaderboard> = {};

  if (before.tags !== after.tags || before.dayorboard !== after.dayorboard) {
    updates.byDorms = leaderboard.byDorms.map((entry) => {
      let tags = entry.tags;
      if (entry.dorm === before.dayorboard) tags -= before.tags;
      if (entry.dorm === after.dayorboard) tags += after.tags;
      return { dorm: entry.dorm, tags };
    });
  }

  if (before.tags !== after.tags || before.class !== after.class) {
    updates.byClass = leaderboard.byClass.map((entry) => {
      let tags = entry.tags;
      if (entry.class === before.class) tags -= before.tags;
      if (entry.class === after.class) tags += after.tags;
      return { class: entry.class, tags };
    });
  }

  const beforeName = `${before.firstName} ${before.lastName}`;
  const afterName = `${after.firstName} ${after.lastName}`;
  const wasTopTagger = leaderboard.topTaggers.some((tagger) => tagger.name === beforeName);

  if ((before.tags !== after.tags || beforeName !== afterName) && indexRows) {
    const topTaggers = topTaggersFromIndex(leaderboard, indexRows, email, after);
    if (JSON.stringify(topTaggers) !== JSON.stringify(leaderboard.topTaggers)) {
      updates.topTaggers = topTaggers;
    }
  } else if (before.tags !== after.tags || beforeName !== afterName) {
    const size = leaderboard.topTaggers.length;
    const others = leaderboard.topTaggers.filter((tagger) => tagger.name !== beforeName);
    const minTags = Math.min(...others.map((tagger) => tagger.tags));
    // they keep their spot if they had one, otherwise they need to beat the lowest top tagger
    const qualifies = others.length < size || after.tags > minTags;

    if (wasTopTagger || qualifies) {
      updates.topTaggers = (qualifies ? others.concat([{ name: afterName, tags: after.tags }]) : others)
        .sort((a, b) => b.tags - a.tags)
        .slice(0, size);
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

/**
 * Picks a random alive player to chase someone who has no spot to go back to
 * (an observer joining, or a player whose whole line of taggers is out).
 * The index is only used to find candidates; each one is checked against their real profile.
 */
async function randomAlivePlayer(
  db: Firestore,
  chain: Chain,
  email: string,
): Promise<string | null> {
  const index = (await db.doc(ADMIN_INDEX_PATH).get()).data() as AdminIndex | undefined;
  const candidates = Object.entries(index?.players ?? {})
    .filter(([candidate, row]) => row.alive && candidate !== email)
    .map(([candidate]) => candidate)
    .sort(() => Math.random() - 0.5);

  for (const candidate of candidates.slice(0, 5)) {
    if ((await chain.load(candidate)).alive) return candidate;
  }
  return null;
}

/**
 * Lets an admin edit a player (see AdminProfileChanges for what can change).
 *
 * Chain changes keep the loop of chasers and targets intact (see chain.ts):
 * - `alive: false` takes them out of the game without anyone getting a tag (use tagOut for a tag)
 * - `alive: true` revives them, after `chaser` / before `targetEmail` if given. Otherwise they go
 *   back in the closest spot (see Chain.closestAliveChaser), or after a random alive player if
 *   they've never played. This is also how observers join the game
 * - `chaser` moves this player so that player chases them
 * - `targetEmail` moves that player so this player chases them
 *
 * Saves everything, stamps who made it, updates the leaderboard and admin index, and writes an
 * adminLog entry, all in one transaction.
 * Returns the player's updated admin table row, plus the rows of anyone else the change moved,
 * so the client can patch just those rows.
 */
export const adminUpdateProfile = onCall(async (request) => {
  const adminEmail = requireAdmin(request);

  const email = request.data?.email;
  if (typeof email !== "string" || email === "") {
    throw new HttpsError("invalid-argument", "email is required");
  }

  const changes = parseChanges(request.data?.changes);
  const { alive, chaser, targetEmail, ...fieldChanges } = changes;

  // so nobody can lock themselves (or everyone) out of the admin panel by accident
  if (email === adminEmail && changes.role !== undefined && changes.role !== "admin") {
    throw new HttpsError("failed-precondition", "Admins can't remove their own admin role");
  }

  const db = getFirestore();

  return await db.runTransaction(async (tx) => {
    const chain = new Chain(db, tx);
    const player = await chain.load(email);
    const before: Profile = JSON.parse(JSON.stringify(player));

    const changesAlive = alive !== undefined && alive !== before.alive;
    const changesChaser = chaser !== undefined && chaser !== before.chaser;
    const changesTarget = targetEmail !== undefined && targetEmail !== before.target.email;

    // only keep fields that actually change, so the log stays readable
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, value] of Object.entries(fieldChanges)) {
      const current = before[field as keyof EditableProfileFields];
      if (current !== value) {
        diff[field] = { from: current, to: value };
      }
    }

    if (Object.keys(diff).length === 0 && !changesAlive && !changesChaser && !changesTarget) {
      return { row: toAdminIndexRow(player), affected: {} };
    }

    // field changes go first, so any new target snapshots below already have the new name
    Object.assign(player, fieldChanges);
    chain.touch(email);

    if (changesChaser && changesTarget) {
      throw new HttpsError("invalid-argument", "Change either the chaser or the target, not both at once");
    }

    if (changesAlive && alive === false) {
      if (changesChaser || changesTarget) {
        throw new HttpsError("invalid-argument", "Taking a player out can't be combined with moving them");
      }
      await chain.remove(email);
    } else if (changesAlive && alive === true) {
      // revive after the chosen chaser, before the chosen target, or in the closest spot
      let anchor: string | null;
      if (changesChaser) {
        anchor = chaser as string;
      } else if (changesTarget) {
        const target = await chain.load(targetEmail as string);
        if (!target.alive) {
          throw new HttpsError("failed-precondition", `${targetEmail} is out, so nobody can chase them`);
        }
        anchor = target.chaser;
      } else {
        anchor = await chain.closestAliveChaser(email) ?? await randomAlivePlayer(db, chain, email);
      }

      if (!anchor) {
        throw new HttpsError("failed-precondition", "Nobody is left in the game to chase them");
      }
      await chain.insertAfter(email, anchor);
    } else if (changesChaser) {
      await chain.moveAfter(email, chaser as string);
    } else if (changesTarget) {
      await chain.moveAfter(targetEmail as string, email);
    }

    // the chaser keeps a copy of their target's name, so a rename has to update it too
    const renamed = diff.firstName !== undefined || diff.lastName !== undefined;
    if (renamed && player.chaser && player.chaser != "none") {
      const playerChaser = await chain.load(player.chaser);
      if (playerChaser.target.email === email) {
        playerChaser.target = {
          ...playerChaser.target,
          firstName: player.firstName,
          lastName: player.lastName,
        };
        chain.touch(player.chaser);
      }
    }

    if (changesAlive) diff.alive = { from: before.alive, to: player.alive };
    if (player.chaser !== before.chaser) diff.chaser = { from: before.chaser, to: player.chaser };
    if (player.target.email !== before.target.email) {
      diff.targetEmail = { from: before.target.email, to: player.target.email };
    }

    // (all reads have to happen before any writes in a transaction)
    const leaderboardRef = db.doc("leaderboard/main");
    const leaderboard = (await tx.get(leaderboardRef)).data() as Leaderboard | undefined;

    // only needed to rebuild topTaggers. read outside the transaction on purpose: the index is
    // rewritten by syncAdminIndex all the time, and that shouldn't make this edit retry
    const topTaggersChange = diff.tags !== undefined || renamed;
    const index = leaderboard && topTaggersChange ?
      (await db.doc(ADMIN_INDEX_PATH).get()).data() as AdminIndex | undefined :
      undefined;

    // writes from here on
    const now = Date.now();
    for (const [, profile] of chain.changed()) {
      profile.lastEditedBy = adminEmail;
      profile.lastEditedAt = now;
    }
    chain.save();

    // a revived player's old last words go away, so their next tag out creates a new entry
    // (updateLeaderboard only runs when the entry is created, not overwritten)
    if (changesAlive && alive === true) {
      tx.delete(db.doc(`lastWords/${email}`));
    }

    // syncAdminIndex would do this a moment later, but writing the rows now means the index is
    // never behind an admin edit, which topTaggersFromIndex relies on for quick back-to-back edits
    const rows: Record<string, AdminIndexRow> = {};
    for (const [changedEmail, profile] of chain.changed()) {
      rows[changedEmail] = toAdminIndexRow(profile);
    }
    tx.set(db.doc(ADMIN_INDEX_PATH), { players: rows, updatedAt: now }, { merge: true });

    const boardUpdates = leaderboard ?
      leaderboardUpdates(leaderboard, before, player, email, index?.players ?? null) :
      null;
    if (boardUpdates) {
      tx.update(leaderboardRef, {
        ...boardUpdates,
        lastUpdated: FieldValue.serverTimestamp(),
      });
    }

    const { [email]: row, ...affected } = rows;
    logAdminAction(db, tx, {
      by: adminEmail,
      action: "updateProfile",
      target: email,
      changes: diff,
      ...(Object.keys(affected).length > 0 && { affected: Object.keys(affected) }),
    });

    // a role change shows up in that player's admin claim the next time they load their profile
    return { row, affected };
  });
});
