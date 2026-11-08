import { BUILDINGS } from "./generated/buildings";
import { buildingAt, Location } from "./buildings";

/** A [latitude, longitude] inside the named building, for tests */
export function pointIn(name: string): Location {
  const building = BUILDINGS.find((b) => b.properties.name === name);
  if (!building) throw new Error(`No building named ${name}`);

  const rings = building.geometry.type === "Polygon" ?
    building.geometry.coordinates :
    building.geometry.coordinates.flat();
  const lngs = rings[0].map(([lng]) => lng);
  const lats = rings[0].map(([, lat]) => lat);
  const [minLng, maxLng, minLat, maxLat] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];

  // footprints aren't always convex, so walk a grid over the bounding box until a point lands inside
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 20; j++) {
      const location: Location = [minLat + (maxLat - minLat) * i / 20, minLng + (maxLng - minLng) * j / 20];
      if (buildingAt(location) === name) return location;
    }
  }
  throw new Error(`Couldn't find a point inside ${name}`);
}
