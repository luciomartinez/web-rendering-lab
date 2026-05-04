export const RENDERER_KINDS = ["dom", "canvas", "webgl", "webgpu"] as const;

export type RendererKind = (typeof RENDERER_KINDS)[number];

export interface PointData {
  id: number;
  x: number;
  y: number;
  radiusPx: number;
  color: string;
  rgb: readonly [number, number, number];
  cluster: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ViewportState {
  width: number;
  height: number;
  dpr: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface SceneState {
  pointCount: number;
  viewport: ViewportState;
}

export interface RenderSize {
  width: number;
  height: number;
  dpr: number;
}

export interface BenchmarkRenderer {
  readonly kind: RendererKind;
  init(container: HTMLElement, data: PointData[], state: SceneState): void | Promise<void>;
  render(state: SceneState): void;
  resize(size: RenderSize): void;
  destroy(): void;
}
