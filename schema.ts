import type {
  AdminIndex, AdminLogEntry, GameSettings, LastWordsEntry,
  Leaderboard, Profile, TagOutEvent,
} from "./types";

/**
 * Firestore document paths and their shapes. Field definitions live in types.ts.
 * Emails identify players; event/log IDs are generated. Times are Unix milliseconds
 * unless noted. Omit optional values instead of writing undefined.
 * Clients use Cloud Functions; firestore.rules denies direct database access.
 * These types describe the schema; they do not validate stored documents at runtime.
 */
export interface FirestoreSchema {
  /**
   * Current game state. Alive players' target.email/chaser links form a loop.
   * Chain saves affected profiles together in a transaction (all reads before writes).
   * target duplicates identity/location: relinking and renames must update that copy.
   * getProfile writes buildings to the chaser's target.location, not profile.location.
   * A location update transaction reads the caller and their current chaser, verifies
   * both are alive and the chaser still targets the caller, then writes only location.
   * Missing/inactive players or mismatched links are skipped (at most two reads/one write).
   * getProfile returns ClientProfile: non-admin responses omit chaser on every path;
   * callers with the current admin roster role retain it. Stored Profile and chain links are unchanged.
   * Mobile response models accept a missing hunter; old profile caches are scrubbed.
   * iOS GameCache and Android cache strip hunter identity on cache read/write;
   * disk caches also omit target.location so a revealed building is not persisted.
   * WireLeaderboard accepts missing email IDs in old mobile cache entries; newly
   * written leaderboard/main entries still require email. Keep cache decoding compatible.
   * The winner has chaser "none" and an empty target.email.
   */
  "data/{email}": Profile;

  /**
   * One event per elimination, including repeat eliminations of the same victim.
   * Created atomically with the victim's activeTagOutEvent pointer.
   * Revival clears that pointer and closes the event (active=false) in the same tx.
   * score is omitted for admin removals and imported history; check-in creates no event.
   * Revenge queries tagger==email, active==true, timestamp ASC using the composite
   * index in firestore.indexes.json, then checks each victim's current event pointer.
   * No time cutoff, local sort, or traversal of unrelated players.
   */
  "tagOutEvents/{eventId}": TagOutEvent;

  /**
   * Latest display entry, overwritten on repeat elimination; not an event history.
   * Written by tagOut/setLastWords; admin revival and revenge delete it.
   * Changes to displayed entries must invalidate lastWordsIndex/main.
   */
  "lastWords/{email}": LastWordsEntry;

  /**
   * Response cache built by getLastWords on a miss; no TTL. Version 2 reads the
   * newest 50 entries by timestamp DESC, filters blank lw, then takes ten.
   * Older published entries can be omitted when the recent window is mostly blank.
   * Missing/older versions are rebuilt so old alphabetical results cannot persist.
   * tagOut, nonempty setLastWords, admin revival, and revenge delete it in their write transactions.
   * Delete this document to rebuild on the next read.
   */
  "lastWordsIndex/main": { version: number; lastWords: LastWordsEntry[] };

  /**
   * Derived scores, read by getLeaderboard. updateLeaderboard processes event.score
   * asynchronously; leaderboardUpdated and aggregate writes commit in one transaction
   * so redelivery cannot count twice. Closing an event does not revoke its score.
   * Top entries are { email, name, tags }: email identifies a player; name is display-only.
   * Score processing matches tagger email and reads the latest profile name/tag total,
   * preserving namesakes, renames and tag corrections during delayed delivery.
   * Admin corrections also match email and adjust aggregates in the profile-edit tx.
   * Delayed score events overlapping dorm/class corrections still need reconciliation.
   * Legacy name-only entries can be rebuilt using
   * scripts/migrate-leaderboard-emails.mjs (dry-run unless --apply; see rollout comments).
   * It rebuilds the top ten from profile IDs/totals, preserving group totals and event
   * markers; current writes identify players by email only.
   * There is no general aggregate rebuild endpoint.
   * lastUpdated is a server timestamp in event writes; the shared client model and
   * seed data currently represent it as milliseconds (an existing type mismatch).
   */
  "leaderboard/main": Omit<Leaderboard, "lastUpdated"> & {
    lastUpdated: number | { readonly seconds: number; readonly nanoseconds: number };
  };

  /**
   * Materialized profile rows without location or event pointers; used by the admin
   * table and check-in sweep. tagOut/admin edits/sweep write affected rows atomically.
   * syncAdminIndex also merges profile changes/deletions and skips location-only writes.
   * rebuildAdminIndex replaces the whole view from data if missing or stale.
   * The sweep rechecks candidate profiles before removing anyone.
   */
  "adminIndex/main": AdminIndex;

  /**
   * Audit entries written in the same transaction as admin actions/check-in sweeps.
   * Ordinary player tags are recorded in tagOutEvents instead.
   * getAdminLog queries at DESC, limited to 50 entries.
   */
  "adminLog/{id}": AdminLogEntry;

  /**
   * Settings with missing values filled by DEFAULT_SETTINGS in settings.ts.
   * getSettings caches per instance for 30 seconds (SETTINGS_CACHE_TTL_MS overrides).
   * Admin updates and sweep markers refresh the writer's cache; other instances
   * can retain old values until TTL expiry. Deadline/day keys use America/New_York.
   * Buildings are generated from GeoJSON; Auth custom claims are outside Firestore.
   */
  "config/game": GameSettings;
}
