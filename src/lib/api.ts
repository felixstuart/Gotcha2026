/**
 * api.ts
 *
 * Typed wrappers around every callable function a player uses (`functions/src`).
 * The names, request and response types all come from `src/generated/callables.ts`
 * (generated from `shared/callables.ts` in the Gotcha2026 repo), so a contract
 * change there breaks `tsc` here instead of failing at runtime.
 *
 * These always hit the network. Caching happens in the screens through
 * `useCached` (cache.ts), and the mutations here invalidate the right entries.
 */
import { httpsCallable } from "@react-native-firebase/functions";
import type {
  Callables,
  CallableName,
  GetProfileRequest,
  LastWordsEntry,
  Profile,
  GameSettings,
  WireLeaderboard,
  ClientTaggedOutResponse,
} from "@/generated/callables";
import type { Leaderboard } from "@/generated/types";
import { functions } from "./firebase";
import { invalidate, KEYS } from "./cache";

export type { GameSettings, LastWordsEntry, Profile, Leaderboard };

/** Calls a callable by name. Request and response types follow from the name. */
async function call<K extends CallableName>(
  name: K,
  data: Callables[K]["request"],
): Promise<Callables[K]["response"]> {
  const fn = httpsCallable<Callables[K]["request"], Callables[K]["response"]>(functions, name);
  const result = await fn(data);
  return result.data;
}

/**
 * The signed-in player's profile (the bare Profile, or null if they have none).
 * Pass `location` ([lat, lng]) to share it: the server works out the building,
 * shows it to their chaser, checks them in, and (with share-to-see) includes
 * their target's building in this response only.
 */
export function getProfile(location?: [number, number] | null): Promise<Profile | null> {
  const req: GetProfileRequest = location ? { location } : {};
  return call("getProfile", req);
}

/** Admin-set game settings (start/end, location features, check-in). */
export function getGameSettings(): Promise<GameSettings> {
  return call("getGameSettings", {});
}

/**
 * The leaderboard, or null if it hasn't been built yet. `lastUpdated` arrives as
 * a Firestore Timestamp ({_seconds, _nanoseconds}), so it's turned into ms here.
 */
export async function getLeaderboard(): Promise<Leaderboard | null> {
  const res = await call("getLeaderboard", {});
  const lb = res?.leaderboard;
  if (!lb) return null;
  return {
    topTaggers: lb.topTaggers ?? [],
    byClass: lb.byClass ?? [],
    byDorms: lb.byDorms ?? [],
    lastUpdated: toMillis(lb.lastUpdated),
  };
}

function toMillis(value: WireLeaderboard["lastUpdated"]): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value._seconds === "number") {
    return value._seconds * 1000 + Math.floor((value._nanoseconds ?? 0) / 1e6);
  }
  return 0;
}

/** The 10 newest last words. */
export async function getLastWords(): Promise<LastWordsEntry[]> {
  const res = await call("getLastWords", {});
  return res?.lastWords ?? [];
}

/**
 * Tags out the signed-in player. Throws with the server's message on failure
 * (e.g. "Gotcha hasn't started yet"), so show `errorMessage(e)` to the player.
 */
export async function tagOut(): Promise<ClientTaggedOutResponse> {
  const res = await call("tagOut", {});
  if (res.status !== 200) throw new Error("Tag out failed");
  // Their profile and the leaderboard changed. Last words change once they submit.
  invalidate(KEYS.profile);
  invalidate(KEYS.leaderboard);
  return res;
}

/** Saves the player's last words. Only allowed once, right after tagOut. */
export async function setLastWords(lastWords: string): Promise<void> {
  const res = await call("setLastWords", { lastWords });
  if (res.status !== 200) throw new Error("Failed to submit");
  invalidate(KEYS.lastWords);
}

/** The error code of a callable error ("failed-precondition", ...), or "". */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  if (typeof code !== "string") return "";
  return code.replace(/^functions\//, ""); // RNFB sometimes prefixes the service
}

/** The message to show for an error. Callable errors carry the server's text. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof Error && e.message) return e.message.replace(/^\[[^\]]+\]\s*/, "");
  return fallback;
}
