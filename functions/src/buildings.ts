import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { BUILDINGS, BUILDING_NAMES } from "./generated/buildings";

export { BUILDING_NAMES };

export type Location = [latitude: number, longitude: number];

/**
 * The name of the building a location is in, or null if it's in none of them.
 * The footprints are compiled into the code from geofence/buildings.geojson
 * (see scripts/generate-buildings.mjs), so this never reads Firestore.
 */
export function buildingAt(location: Location): string | null {
  // GeoJSON uses (longitude, latitude), so flip it
  const where = point([location[1], location[0]]);
  return BUILDINGS.find((building) => booleanPointInPolygon(where, building))?.properties.name ?? null;
}
