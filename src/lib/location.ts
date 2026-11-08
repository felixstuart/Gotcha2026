/**
 * location.ts
 *
 * One-shot foreground location, so the server can tell which building the player
 * is in (see `functions/src/getProfile.ts`). Only "while using the app" permission
 * is asked for, and the app never tracks location continuously or in the background.
 */
import * as Location from "expo-location";

const TIMEOUT_MS = 10_000; // same as the website

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Location timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Returns `[latitude, longitude]` (the order the server expects), or `null` if
 * permission was denied, location is off, or it took longer than 10 s.
 *
 * `fresh: false` accepts a position up to a minute old, like the website's first
 * attempt. A retry passes `fresh: true`, since the player has probably moved.
 */
export async function getCoords({ fresh = false } = {}): Promise<[number, number] | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    if (!fresh) {
      const recent = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      if (recent) return [recent.coords.latitude, recent.coords.longitude];
    }

    // High uses GPS. Balanced would depend on Google's network location ("Location
    // Accuracy"), which players can decline, and then it never returns a fix at all
    // Google's "turn on Location Accuracy" dialog only when location is actually off.
    // Otherwise a player who said "No thanks" once would get it every time.
    const servicesOn = await Location.hasServicesEnabledAsync();
    try {
      const position = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: !servicesOn,
        }),
        TIMEOUT_MS,
      );
      return [position.coords.latitude, position.coords.longitude];
    } catch {
      // no new fix in time (e.g. indoors): settle for one from the last few minutes
      const fallback = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      return fallback ? [fallback.coords.latitude, fallback.coords.longitude] : null;
    }
  } catch {
    return null;
  }
}
