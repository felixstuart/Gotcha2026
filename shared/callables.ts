// The request and response of every callable function a player client uses.
// The website, the functions and both apps share these, and scripts/generate-clients.mjs
// turns them into Swift for the iOS app (ios/) and copies them into the Android app (android/).
// The function names, regions and which types they use live in callables.json.

import type {
  ClientLastWordsResponse,
  ClientTaggedOutResponse,
  GameSettings,
  Leaderboard,
  LastWordsEntry,
  Profile,
} from "../types";

export type { ClientLastWordsResponse, ClientTaggedOutResponse, GameSettings, LastWordsEntry, Profile };

// Callables that take no arguments are sent {}
export type EmptyRequest = Record<string, never>;

export interface GetProfileRequest {
  // [latitude, longitude]. Only send it when the player shares their location
  location?: [number, number];
}

export interface SetLastWordsRequest {
  lastWords: string;
}

export interface StatusResponse {
  status: number;
}

// How a Firestore Timestamp comes through a callable response
export interface WireTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

// leaderboard/main as getLeaderboard sends it. updateLeaderboard writes lastUpdated with
// serverTimestamp(), so it arrives as a WireTimestamp rather than the number Leaderboard says.
export interface WireLeaderboard extends Omit<Leaderboard, "lastUpdated"> {
  lastUpdated: WireTimestamp | number | null;
}

export interface GetLeaderboardResponse {
  leaderboard: WireLeaderboard | null;
}

// Request and response types by function name. Must match callables.json
export interface Callables {
  getProfile: { request: GetProfileRequest; response: Profile | null };
  getGameSettings: { request: EmptyRequest; response: GameSettings };
  getLeaderboard: { request: EmptyRequest; response: GetLeaderboardResponse };
  getLastWords: { request: EmptyRequest; response: ClientLastWordsResponse };
  tagOut: { request: EmptyRequest; response: ClientTaggedOutResponse };
  setLastWords: { request: SetLastWordsRequest; response: StatusResponse };
}

export type CallableName = keyof Callables;
