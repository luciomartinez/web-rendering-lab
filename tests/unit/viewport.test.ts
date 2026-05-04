import { describe, expect, it } from "vitest";
import type { PointData, ViewportState } from "../../src/types";
import { nearestPoint, screenToWorld, worldToScreen, zoomViewportAt } from "../../src/viewport";

const viewport: ViewportState = {
  width: 800,
  height: 600,
  dpr: 2,
  scale: 0.5,
  offsetX: 25,
  offsetY: 40
};

const points: PointData[] = [
  {
    id: 0,
    x: 100,
    y: 100,
    radiusPx: 3,
    color: "#000000",
    rgb: [0, 0, 0],
    cluster: 0
  },
  {
    id: 1,
    x: 220,
    y: 180,
    radiusPx: 3,
    color: "#ffffff",
    rgb: [1, 1, 1],
    cluster: 1
  }
];

describe("viewport transforms", () => {
  it("round-trips world and screen coordinates", () => {
    const world = { x: 345, y: 678 };
    const screen = worldToScreen(world, viewport);

    expect(screenToWorld(screen, viewport)).toEqual(world);
  });

  it("keeps the zoom anchor stable", () => {
    const anchor = { x: 320, y: 240 };
    const before = screenToWorld(anchor, viewport);
    const zoomed = zoomViewportAt(viewport, anchor, 1.8);
    const after = screenToWorld(anchor, zoomed);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe("hit testing", () => {
  it("finds the nearest point inside the screen tolerance", () => {
    const rendered = worldToScreen(points[1], viewport);

    expect(nearestPoint(points, viewport, { x: rendered.x + 2, y: rendered.y + 1 })?.id).toBe(1);
  });

  it("returns null when no point is close enough", () => {
    expect(nearestPoint(points, viewport, { x: 799, y: 599 })).toBeNull();
  });

});
