import { describe, expect, it } from "vitest";
import { generatePoints, WORLD_BOUNDS } from "../../src/data";

describe("generatePoints", () => {
  it("returns deterministic points for the same seed", () => {
    expect(generatePoints(12, 42)).toEqual(generatePoints(12, 42));
  });

  it("changes the dataset when the seed changes", () => {
    expect(generatePoints(12, 42)).not.toEqual(generatePoints(12, 43));
  });

  it("keeps points inside world bounds", () => {
    const points = generatePoints(2_000, 123);

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
      expect(point.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
      expect(point.y).toBeGreaterThanOrEqual(WORLD_BOUNDS.minY);
      expect(point.y).toBeLessThanOrEqual(WORLD_BOUNDS.maxY);
    }
  });
});
