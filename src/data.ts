import type { PointData, WorldBounds } from "./types";

export const DEFAULT_SEED = 20260504;
export const DEFAULT_POINT_COUNT = 100_000;
export const WORLD_BOUNDS: WorldBounds = {
  minX: 0,
  minY: 0,
  maxX: 10_000,
  maxY: 10_000
};

const CLUSTER_PALETTE: Array<readonly [string, readonly [number, number, number]]> = [
  ["#14b8a6", [0.078, 0.722, 0.651]],
  ["#f97316", [0.976, 0.451, 0.086]],
  ["#3b82f6", [0.231, 0.51, 0.965]],
  ["#e11d48", [0.882, 0.114, 0.282]],
  ["#84cc16", [0.518, 0.8, 0.086]],
  ["#a855f7", [0.659, 0.333, 0.969]],
  ["#facc15", [0.98, 0.8, 0.082]],
  ["#06b6d4", [0.024, 0.714, 0.831]]
];

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generatePoints(count: number, seed = DEFAULT_SEED): PointData[] {
  const random = createSeededRandom(seed);
  const clusterCenters = CLUSTER_PALETTE.map((_, index) => {
    const ring = index % 4;
    const row = Math.floor(index / 4);
    return {
      x: 1800 + ring * 2200 + (random() - 0.5) * 900,
      y: 2300 + row * 4300 + (random() - 0.5) * 1200
    };
  });

  const points: PointData[] = new Array(count);

  for (let index = 0; index < count; index += 1) {
    const cluster = Math.floor(random() * clusterCenters.length);
    const center = clusterCenters[cluster];
    const spread = 560 + random() * 980;
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * spread;
    const wobble = (random() - 0.5) * 260;
    const x = clamp(center.x + Math.cos(angle) * distance + wobble, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
    const y = clamp(center.y + Math.sin(angle) * distance - wobble, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY);
    const radiusPx = 1.6 + random() * 2.2;
    const [color, rgb] = CLUSTER_PALETTE[cluster];

    points[index] = {
      id: index,
      x,
      y,
      radiusPx,
      color,
      rgb,
      cluster
    };
  }

  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
