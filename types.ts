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

export type AdminAction = "updateProfile" | "tagOut" | "rebuildIndex";

// One entry in the adminLog collection. Written by the admin functions in the
// same transaction as the change itself, so the log can't drift from reality.
export interface AdminLogEntry {
  at: number;
  by: string; // admin email, always taken from their token
  action: AdminAction;
  target: string | null; // player email, if the action was about one player
  changes?: Record<string, { from: unknown; to: unknown }>;
  affected?: Array<string>; // other players a chain change moved
}
