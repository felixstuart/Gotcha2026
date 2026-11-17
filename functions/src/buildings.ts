import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { BUILDINGS, BUILDING_NAMES } from "./generated/buildings";

export { BUILDING_NAMES };

export type Location = [latitude: number, longitude: number];

/**
 * How far outside a footprint (in metres) still counts as being in that building.
 * Phone GPS is often 20-50 m off indoors, and some footprints are under 20 m across,
 * so without a margin players standing inside a building were placed outside it.
 */
export const BUILDING_MARGIN_M = 30;

const EARTH_RADIUS_M = 6_371_000;

/**
 * Distance in metres from a point to a footprint's edge (0 if it's inside).
 * Uses a flat projection around the point, which is accurate at campus scale.
 */
function metresOutside(location: Location, building: typeof BUILDINGS[number]): number {
  const [lat, lng] = location;
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const mPerDegLng = mPerDegLat * Math.cos(lat * Math.PI / 180);
  // GeoJSON is (longitude, latitude); measure everything in metres from the player
  const toXY = ([pLng, pLat]: number[]) => [(pLng - lng) * mPerDegLng, (pLat - lat) * mPerDegLat];

  const polygons = building.geometry.type === "Polygon" ?
    [building.geometry.coordinates] :
    building.geometry.coordinates;
  let best = Infinity;
  for (const ring of polygons.flat()) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = toXY(ring[i]);
      const [bx, by] = toXY(ring[i + 1]);
      // closest point on segment AB to the player (the origin)
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/**
 * The name of the building a location is in, or null if it's in none of them.
 * A point inside a footprint wins; otherwise the nearest footprint within
 * BUILDING_MARGIN_M counts, to allow for GPS error indoors.
 * Used for check-in and for the chaser's copy of their target's building.
 * The footprints are compiled into the code from geofence/buildings.geojson
 * (see scripts/generate-buildings.mjs), so this never reads Firestore.
 */
export function buildingAt(location: Location): string | null {
  // GeoJSON uses (longitude, latitude), so flip it
  const where = point([location[1], location[0]]);
  const inside = BUILDINGS.find((building) => booleanPointInPolygon(where, building));
  if (inside) return inside.properties.name;

  let nearest: string | null = null;
  let nearestDistance = BUILDING_MARGIN_M;
  for (const building of BUILDINGS) {
    const distance = metresOutside(location, building);
    if (distance <= nearestDistance) {
      nearest = building.properties.name;
      nearestDistance = distance;
    }
  }
  return nearest;
}
