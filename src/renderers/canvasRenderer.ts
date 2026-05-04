import type { BenchmarkRenderer, PointData, RenderSize, SceneState, ScreenPoint } from "../types";
import { getVisibleWorldBounds, isPointInsideBounds, nearestPoint, worldToScreen } from "../viewport";

export class CanvasRenderer implements BenchmarkRenderer {
  readonly kind = "canvas" as const;

  private data: PointData[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private size: RenderSize = { width: 1, height: 1, dpr: 1 };

  init(container: HTMLElement, data: PointData[], state: SceneState): void {
    this.data = data;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "render-canvas";
    this.canvas.dataset.rendererCanvas = "canvas";
    this.context = this.canvas.getContext("2d", { alpha: true });

    if (!this.context) {
      throw new Error("Canvas 2D context is unavailable");
    }

    container.append(this.canvas);
    this.resize(state.viewport);
    this.render(state);
  }

  resize(size: RenderSize): void {
    this.size = size;

    if (!this.canvas) {
      return;
    }

    this.canvas.style.width = `${size.width}px`;
    this.canvas.style.height = `${size.height}px`;
    this.canvas.width = Math.max(1, Math.floor(size.width * size.dpr));
    this.canvas.height = Math.max(1, Math.floor(size.height * size.dpr));
  }

  render(state: SceneState): void {
    if (!this.context) {
      return;
    }

    const ctx = this.context;
    const { width, height, dpr } = this.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, state);

    const visibleBounds = getVisibleWorldBounds(state.viewport, 40);

    for (const point of this.data) {
      if (!isPointInsideBounds(point, visibleBounds)) {
        continue;
      }

      const rendered = worldToScreen(point, state.viewport);
      ctx.beginPath();
      ctx.arc(rendered.x, rendered.y, point.radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = colorForPoint(point, state);
      ctx.fill();
    }
  }

  hitTest(point: ScreenPoint): PointData | null {
    const appState = window.__WEB_RENDERING_LAB_STATE__;
    if (!appState) {
      return null;
    }

    return nearestPoint(this.data, appState.viewport, point);
  }

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.context = null;
    this.data = [];
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, state: SceneState): void {
  const { width, height, scale, offsetX, offsetY } = state.viewport;
  const worldStep = 1_000;
  const screenStep = worldStep * scale;

  if (screenStep < 18) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  const firstX = offsetX % screenStep;
  const firstY = offsetY % screenStep;

  for (let x = firstX; x < width; x += screenStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }

  for (let y = firstY; y < height; y += screenStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }

  ctx.stroke();
  ctx.restore();
}

function colorForPoint(point: PointData, state: SceneState): string {
  if (state.hoveredId === point.id) {
    return "#f8fafc";
  }

  if (state.selectedIds.has(point.id)) {
    return "#f59e0b";
  }

  return point.color;
}
