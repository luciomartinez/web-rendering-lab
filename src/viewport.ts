import type { PointData, ScreenPoint, ViewportState, WorldBounds, WorldPoint } from "./types";

export function createViewport(width: number, height: number, dpr = getDevicePixelRatio()): ViewportState {
  return {
    width,
    height,
    dpr,
    scale: 1,
    offsetX: 0,
    offsetY: 0
  };
}

export function fitViewportToBounds(
  viewport: ViewportState,
  bounds: WorldBounds,
  paddingPx = 56
): ViewportState {
  const usableWidth = Math.max(1, viewport.width - paddingPx * 2);
  const usableHeight = Math.max(1, viewport.height - paddingPx * 2);
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(usableWidth / worldWidth, usableHeight / worldHeight);

  return {
    ...viewport,
    scale,
    offsetX: (viewport.width - worldWidth * scale) / 2 - bounds.minX * scale,
    offsetY: (viewport.height - worldHeight * scale) / 2 - bounds.minY * scale
  };
}

export function worldToScreen(point: WorldPoint, viewport: ViewportState): ScreenPoint {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY
  };
}

export function screenToWorld(point: ScreenPoint, viewport: ViewportState): WorldPoint {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale
  };
}

export function panViewport(viewport: ViewportState, dx: number, dy: number): ViewportState {
  return {
    ...viewport,
    offsetX: viewport.offsetX + dx,
    offsetY: viewport.offsetY + dy
  };
}

export function zoomViewportAt(
  viewport: ViewportState,
  anchor: ScreenPoint,
  factor: number,
  minScale = 0.018,
  maxScale = 8
): ViewportState {
  const nextScale = clamp(viewport.scale * factor, minScale, maxScale);
  const worldAnchor = screenToWorld(anchor, viewport);

  return {
    ...viewport,
    scale: nextScale,
    offsetX: anchor.x - worldAnchor.x * nextScale,
    offsetY: anchor.y - worldAnchor.y * nextScale
  };
}

export function getVisibleWorldBounds(viewport: ViewportState, paddingPx = 24): WorldBounds {
  const topLeft = screenToWorld({ x: -paddingPx, y: -paddingPx }, viewport);
  const bottomRight = screenToWorld(
    { x: viewport.width + paddingPx, y: viewport.height + paddingPx },
    viewport
  );

  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y)
  };
}

export function isPointInsideBounds(point: PointData, bounds: WorldBounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

export function getDevicePixelRatio(): number {
  return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
