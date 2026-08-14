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
}

export type Role = "admin" | "player" | "observer"

export interface ClientTaggedOutResponse {
  status: number;
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