/**
 * cache.ts
 *
 * A small stale-while-revalidate cache for callable results, saved to disk so a
 * cold start shows the last data instantly and then refreshes it.
 *
 * - Storage: `expo-sqlite/kv-store` (the Expo SDK's key-value store; its sync
 *   API lets the first render read the saved data without a loading flash).
 * - Entries are keyed per signed-in user (`gotcha-cache:{uid}:{key}`) and are all
 *   deleted on sign-out (useAuth calls `clearCache`).
 * - Each entry remembers when it was fetched. Screens pass a TTL; older data is
 *   still shown but refetched on mount, on returning to the foreground, and after
 *   `invalidate`. Pull-to-refresh (`refresh()`) always refetches.
 * - Concurrent requests for the same key share one network call.
 * - The target's building (`profile.target.location`) is never written to disk:
 *   with "share to see" on it must only come from the response it was revealed in.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import Storage from "expo-sqlite/kv-store";
import type { Profile } from "@/generated/types";

/** Cache keys, kept in one place so screens and invalidation can't drift apart. */
export const KEYS = {
  profile: "profile",
  settings: "settings",
  leaderboard: "leaderboard",
  lastWords: "lastWords",
} as const;
export type CacheKey = (typeof KEYS)[keyof typeof KEYS];

/** How long each kind of data counts as fresh. */
export const TTL: Record<CacheKey, number> = {
  profile: 30_000,
  settings: 5 * 60_000,
  leaderboard: 60_000,
  lastWords: 5 * 60_000,
};

type Entry = { data: unknown; fetchedAt: number }; // fetchedAt 0 = invalidated
type Event = "update" | "invalidate";

const PREFIX = "gotcha-cache:";
let uid: string | null = null;
const memory = new Map<string, Entry>(); // by disk key
const inFlight = new Map<string, Promise<unknown>>(); // by disk key
const listeners = new Map<CacheKey, Set<(event: Event) => void>>();

/** Strips what must never be persisted before an entry goes to disk. */
function forDisk(key: CacheKey, data: unknown): unknown {
  if (key !== KEYS.profile || !data) return data;
  const profile = data as Profile;
  if (!profile.target) return profile;
  const { location: _hidden, ...target } = profile.target;
  return { ...profile, target };
}

function diskKey(key: CacheKey) {
  return `${PREFIX}${uid ?? "anon"}:${key}`;
}

/** Called by useAuth whenever the signed-in user changes. */
export function setCacheUser(nextUid: string | null) {
  uid = nextUid;
}

function readEntry(key: CacheKey): Entry | undefined {
  const dk = diskKey(key);
  const hit = memory.get(dk);
  if (hit) return hit;
  if (!uid) return undefined;
  try {
    const raw = Storage.getItemSync(dk);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry;
    memory.set(dk, entry);
    return entry;
  } catch {
    return undefined; // unreadable entry: treat as a miss
  }
}

function writeEntry(key: CacheKey, entry: Entry) {
  const dk = diskKey(key);
  memory.set(dk, entry);
  if (!uid) return;
  Storage.setItem(dk, JSON.stringify({ ...entry, data: forDisk(key, entry.data) })).catch(() => {});
}

function emit(key: CacheKey, event: Event) {
  listeners.get(key)?.forEach((listener) => listener(event));
}

/** The current value for `key` (in memory or saved), without fetching. */
export function peek<T>(key: CacheKey): T | undefined {
  return readEntry(key)?.data as T | undefined;
}

/** Stores a value fetched outside useCached (e.g. the profile from a location share). */
export function setCached(key: CacheKey, data: unknown) {
  writeEntry(key, { data, fetchedAt: Date.now() });
  emit(key, "update");
}

/** Marks an entry stale so mounted screens refetch it (old data stays on screen meanwhile). */
export function invalidate(key: CacheKey) {
  const entry = readEntry(key);
  if (entry) writeEntry(key, { ...entry, fetchedAt: 0 });
  emit(key, "invalidate");
}

/** Forgets everything, in memory and on disk. Called on sign-out. */
export async function clearCache() {
  memory.clear();
  inFlight.clear();
  try {
    const keys = (await Storage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await Storage.multiRemove(keys);
  } catch {
    // nothing else to do: the entries are keyed per user anyway
  }
}

/** Fetches `key`, sharing an in-flight request if there is one, and stores the result. */
function fetchKey<T>(key: CacheKey, fetcher: () => Promise<T>): Promise<T> {
  const dk = diskKey(key);
  const running = inFlight.get(dk);
  if (running) return running as Promise<T>;
  const request = fetcher()
    .then((data) => {
      if (diskKey(key) === dk) setCached(key, data); // ignore results for a signed-out user
      return data;
    })
    .finally(() => {
      if (inFlight.get(dk) === request) inFlight.delete(dk);
    });
  inFlight.set(dk, request);
  return request;
}

function isFresh(key: CacheKey, ttlMs: number) {
  const entry = readEntry(key);
  return !!entry && entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < ttlMs;
}

/**
 * Hook for screens:
 *
 *   const { data, error, loading, refreshing, refresh } =
 *     useCached(KEYS.leaderboard, api.getLeaderboard);
 *
 * - `data` starts with whatever is saved (even if stale), then updates.
 * - `loading` is only true while there's nothing to show yet.
 * - `error` is the last refresh's error. With saved data you can keep showing it.
 * - `refresh()` ignores the TTL (pull-to-refresh).
 */
export function useCached<T>(key: CacheKey, fetcher: () => Promise<T>, enabled = true) {
  const ttlMs = TTL[key];
  const [data, setData] = useState<T | undefined>(() => readEntry(key)?.data as T | undefined);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The latest fetcher, so callers can pass inline functions.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(
    async (force: boolean) => {
      if (!force && isFresh(key, ttlMs)) return;
      try {
        await fetchKey(key, () => fetcherRef.current());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [key, ttlMs],
  );

  useEffect(() => {
    // With `enabled` false the hook only follows the cache and never fetches.
    // load() only sets state after its network await, so this doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) load(false);

    const listener = (event: Event) => {
      if (event === "update") setData(readEntry(key)?.data as T | undefined);
      else if (enabled) load(false);
    };
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(listener);

    // Back from the background: refetch if it went stale meanwhile.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && enabled) load(false);
    });

    return () => {
      listeners.get(key)?.delete(listener);
      sub.remove();
    };
  }, [key, load, enabled]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return {
    data,
    error,
    loading: enabled && data === undefined && !error,
    refreshing,
    refresh,
  };
}
