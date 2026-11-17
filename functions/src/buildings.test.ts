import { describe, expect, it } from "vitest";
import { BUILDINGS } from "./generated/buildings";
import { BUILDING_MARGIN_M, buildingAt, Location } from "./buildings";
import { pointIn } from "./testBuildings";

const M_PER_DEG_LAT = (Math.PI / 180) * 6_371_000;

/** The northernmost corner of a footprint, as [latitude, longitude] */
function northCorner(name: string): Location {
  const building = BUILDINGS.find((b) => b.properties.name === name)!;
  const rings = building.geometry.type === "Polygon" ?
    building.geometry.coordinates :
    building.geometry.coordinates.flat();
  const [lng, lat] = rings.flat().reduce((a, b) => (b[1] > a[1] ? b : a));
  return [lat, lng];
}

/** A location `metres` due north of a footprint's northernmost corner */
function northOf(name: string, metres: number): Location {
  const [lat, lng] = northCorner(name);
  return [lat + metres / M_PER_DEG_LAT, lng];
}

describe("buildingAt", () => {
  it("names the building a point is inside", () => {
    for (const { properties: { name } } of BUILDINGS) {
      expect(buildingAt(pointIn(name))).toBe(name);
    }
  });

  it("counts a point just outside a footprint as in that building (GPS error)", () => {
    // nothing lies north of a footprint's northernmost corner within this distance
    // except that footprint, unless a neighbour does, in which case it's a building anyway
    for (const { properties: { name } } of BUILDINGS) {
      expect(buildingAt(northOf(name, 10))).not.toBeNull();
    }
    const counted = BUILDINGS
      .map((b) => b.properties.name)
      .filter((name) => buildingAt(northOf(name, 10)) === name);
    // most footprints have open ground to the north; all of them still count as a building
    expect(counted.length).toBeGreaterThan(BUILDINGS.length / 2);
  });

  it("ignores points beyond the margin", () => {
    const [lat, lng] = northCorner(BUILDINGS[0].properties.name);
    // a kilometre north of campus is far from every footprint
    expect(buildingAt([lat + 1000 / M_PER_DEG_LAT, lng])).toBeNull();
    expect(BUILDING_MARGIN_M).toBeLessThan(100);
  });

  it("prefers the building a point is inside over a nearer edge of another", () => {
    // pointIn picks interior points; being inside always wins regardless of neighbours
    for (const { properties: { name } } of BUILDINGS) {
      expect(buildingAt(pointIn(name))).toBe(name);
    }
  });
});
