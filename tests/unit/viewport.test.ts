import { describe, expect, it } from "vitest";
import type { ViewportState } from "../../src/types";
import { pinchViewport, screenToWorld, worldToScreen, zoomViewportAt } from "../../src/viewport";

const viewport: ViewportState = {
  width: 800,
  height: 600,
  dpr: 2,
  scale: 0.5,
  offsetX: 25,
  offsetY: 40
};

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

  it("combines pinch zoom and center movement", () => {
    const startCenter = { x: 320, y: 240 };
    const currentCenter = { x: 350, y: 220 };
    const pinched = pinchViewport(viewport, startCenter, currentCenter, 2);

    expect(pinched.scale).toBeCloseTo(viewport.scale * 2, 6);
    expect(screenToWorld(currentCenter, pinched)).toEqual(screenToWorld(startCenter, viewport));
  });
});
