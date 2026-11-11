// A collection of shared types across the website and functions

export interface Profile {
  alive: boolean;
  role: Role;
  chaser: string;
  class: string;
  dayorboard: string;
  firstName: string;
  lastName: string;
  tags: number;
  target: {
    firstName: string;
    lastName: string;
    email: string;
    location?: string;
  }
  // bear in mind that this location field will not be updated by the server. it's just a pull down from the getProfile function when the location is enabled
  // DO NOT write any code that relies on it.
  location?: string;
  // set by adminUpdateProfile so everyone can see who last touched a player
  lastEditedBy?: string;
  lastEditedAt?: number;
  // when they last checked in (ms since epoch). Set by getProfile, at most once per school day
  checkedInAt?: number;
  // The event for their current elimination; removed when they return to the game.
  activeTagOutEvent?: string;
}

// getProfile omits the hunter for non-admins; admins may receive the stored value.
// Editor metadata is also omitted for players; database profiles remain unchanged.
// Keep the database Profile strict: chain operations always require a chaser.
export interface ClientProfile extends Omit<Profile, "chaser"> {
  chaser?: string;
}

// One document per elimination, including repeat eliminations of the same player.
export interface TagOutEvent {
  tagger: string;
  victim: string;
  timestamp: number;
  active: boolean; // false once this elimination no longer qualifies for revenge
  // Omitted for admin removals and imported history, which must not award a tag.
  score?: { name: string; class: string; dorm: string; tags: number };
  leaderboardUpdated?: boolean;
}

export type Role = "admin" | "player" | "observer"

export interface ClientTaggedOutResponse {
  status: number;
  winner: string | null; // set when this tag left only one player standing
  rows: Record<string, AdminIndexRow>; // admin table rows of everyone the tag changed
}

export interface LastWordsEntry {
  lw: string;
  author: string;
  timestamp: number;
}

export interface ClientLastWordsResponse {
  lastWords: Array<LastWordsEntry>;
}

export interface Leaderboard {
  topTaggers : Array<{
    email: string; // stable player identity; names are display-only
    name: string;
    tags: number;
  }>;
  byDorms: Array<{
    dorm: string;
    tags: number;
  }>;
  byClass: Array<{
    class: string;
    tags: number;
  }>;

  lastUpdated: number;
}

// One player's row in the admin table. Only what the table needs (no location).
// Kept up to date by the syncAdminIndex trigger, so never write it by hand.
export interface AdminIndexRow {
  firstName: string;
  lastName: string;
  class: string;
  dayorboard: string;
  role: Role;
  alive: boolean;
  tags: number;
  chaser: string;
  targetEmail: string;
  lastEditedBy: string | null;
  lastEditedAt: number | null;
  checkedInAt: number | null; // the daily check-in sweep reads this, so it never reads profiles to find who missed
}

// The adminIndex/main document
export interface AdminIndex {
  players: Record<string, AdminIndexRow>; // keyed by email
  updatedAt: number;
}

// The plain profile fields admins can edit
export type EditableProfileFields = Pick<Profile,
  "firstName" | "lastName" | "class" | "dayorboard" | "role" | "tags">;

// What adminUpdateProfile accepts. alive, chaser and targetEmail are linked between players,
// so changing them also updates the players around them (see functions/src/chain.ts).
// The names match AdminIndexRow, so a table cell edit can be sent as { [field]: newValue }
export type AdminProfileChanges = Partial<EditableProfileFields> & {
  alive?: boolean;
  chaser?: string; // email
  targetEmail?: string;
};

export type AdminAction = "updateProfile" | "tagOut" | "rebuildIndex" | "updateSettings" | "missedCheckIn";

// One entry in the adminLog collection. Written by the admin functions in the
// same transaction as the change itself, so the log can't drift from reality.
export interface AdminLogEntry {
  at: number;
  by: string; // admin email, always taken from their token, or "system" for the check-in sweep
  action: AdminAction;
  target: string | null; // player email, if the action was about one player
  changes?: Record<string, { from: unknown; to: unknown }>;
  affected?: Array<string>; // other players a chain change moved
}

// Game-wide settings admins can change, stored in config/game.
// Functions read them through a short in-memory cache (functions/src/settings.ts).
export interface GameSettings {
  // players can only be tagged out between these times (ms since epoch). null means no limit
  startsAt: number | null;
  endsAt: number | null;
  // revive a tagged-out player's victims in the same transaction, with no time cutoff (functions/src/revenge.ts)
  revengeEnabled: boolean;
  // players' phones report which building they're in, and their chaser sees it
  locationEnabled: boolean;
  // chasers get their target's building (needs locationEnabled too). when off, it's still saved but never sent to players
  seeTargetLocation: boolean;
  // players only get their target's building in a response to a call where they shared their own
  shareToSeeTargetLocation: boolean;
  // alive players have to check in (by sharing their location in a building) every school day
  // before checkInDeadline, or the check-in sweep takes them out (functions/src/checkInSweep.ts)
  checkInEnabled: boolean;
  checkInDeadline: number; // minutes after midnight, school time (America/New_York)
  checkInBuilding: string | null; // null means any building
  // the school day (YYYY-MM-DD) the sweep last ran for. Only the sweep (and turning check-in on) set it
  lastCheckInSweepDay: string | null;
  updatedAt: number | null;
  updatedBy: string | null;
}
