import type { BenchmarkRenderer, PointData, RenderSize, SceneState } from "../types";

const CHUNK_SIZE = 5_000;

export class DomRenderer implements BenchmarkRenderer {
  readonly kind = "dom" as const;

  private root: HTMLDivElement | null = null;
  private layer: HTMLDivElement | null = null;
  private disposed = false;

  async init(container: HTMLElement, data: PointData[], state: SceneState): Promise<void> {
    this.disposed = false;
    this.root = document.createElement("div");
    this.root.className = "dom-scene";
    this.layer = document.createElement("div");
    this.layer.className = "dom-scene__layer";
    this.root.append(this.layer);
    container.append(this.root);

    await this.createElements(data);
    this.render(state);
  }

  render(state: SceneState): void {
    if (!this.layer || this.disposed) {
      return;
    }

    const { offsetX, offsetY, scale } = state.viewport;
    this.layer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
  }

  resize(_size: RenderSize): void {
    this.renderSizeAttributes();
  }

  destroy(): void {
    this.disposed = true;
    this.root?.remove();
    this.root = null;
    this.layer = null;
  }

  private async createElements(data: PointData[]): Promise<void> {
    if (!this.layer) {
      return;
    }

    for (let start = 0; start < data.length; start += CHUNK_SIZE) {
      if (this.disposed || !this.layer) {
        return;
      }

      const fragment = document.createDocumentFragment();
      const end = Math.min(data.length, start + CHUNK_SIZE);

      for (let index = start; index < end; index += 1) {
        const point = data[index];
        const dot = document.createElement("div");
        dot.className = "scatter-dot";
        dot.style.left = `${point.x}px`;
        dot.style.top = `${point.y}px`;
        dot.style.width = `${point.radiusPx * 2}px`;
        dot.style.height = `${point.radiusPx * 2}px`;
        dot.style.backgroundColor = point.color;
        dot.dataset.pointId = String(point.id);
        fragment.append(dot);
      }

      this.layer.append(fragment);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  private renderSizeAttributes(): void {
    if (!this.root) {
      return;
    }

    this.root.style.width = "100%";
    this.root.style.height = "100%";
  }
}

declare global {
  interface Window {
    __WEB_RENDERING_LAB_STATE__?: SceneState;
  }
}
