import { DEFAULT_POINT_COUNT, generatePoints, WORLD_BOUNDS } from "./data";
import { FrameMeter } from "./metrics";
import { CanvasRenderer } from "./renderers/canvasRenderer";
import { DomRenderer } from "./renderers/domRenderer";
import { WebGLRenderer } from "./renderers/webglRenderer";
import { WebGPURenderer } from "./renderers/webgpuRenderer";
import type { BenchmarkRenderer, PointData, RendererKind, SceneState, ScreenPoint } from "./types";
import { RENDERER_KINDS } from "./types";
import {
  createViewport,
  fitViewportToBounds,
  getDevicePixelRatio,
  idsWithinScreenRadius,
  panViewport,
  zoomViewportAt
} from "./viewport";

const ROUTE_LABELS: Record<RendererKind, string> = {
  dom: "DOM",
  canvas: "Canvas 2D",
  webgl: "WebGL2",
  webgpu: "WebGPU"
};

const POINT_COUNT_OPTIONS = [1_000, 10_000, 50_000, 100_000];

export class RenderingLabApp {
  private root: HTMLElement;
  private stage: HTMLDivElement | null = null;
  private renderer: BenchmarkRenderer | null = null;
  private data: PointData[] = generatePoints(DEFAULT_POINT_COUNT);
  private state: SceneState = {
    pointCount: DEFAULT_POINT_COUNT,
    hoveredId: null,
    selectedIds: new Set<number>(),
    viewport: createViewport(1, 1)
  };
  private frameMeter = new FrameMeter();
  private resizeObserver: ResizeObserver | null = null;
  private mountToken = 0;
  private dragState:
    | {
        pointerId: number;
        start: ScreenPoint;
        previous: ScreenPoint;
        moved: boolean;
      }
    | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start(): void {
    const route = this.getRoute();
    if (!route) {
      history.replaceState(null, "", "/dom");
    }

    this.renderShell();
    this.bindShellEvents();
    void this.mountRenderer();
    this.startAnimationLoop();
    window.addEventListener("popstate", this.handlePopState);
  }

  private renderShell(): void {
    const activeKind = this.getActiveKind();
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">Benchmark lab</p>
            <h1>Web Rendering Lab</h1>
          </div>
          <nav class="renderer-tabs" aria-label="Renderer demos">
            ${RENDERER_KINDS.map(
              (kind) => `
                <a class="renderer-tab ${kind === activeKind ? "is-active" : ""}"
                  href="/${kind}"
                  data-route="${kind}"
                  aria-current="${kind === activeKind ? "page" : "false"}">
                  ${ROUTE_LABELS[kind]}
                </a>
              `
            ).join("")}
          </nav>
        </header>

        <section class="control-strip" aria-label="Benchmark controls">
          <label class="field">
            <span>Points</span>
            <select id="point-count" data-testid="point-count">
              ${POINT_COUNT_OPTIONS.map(
                (count) => `<option value="${count}" ${count === this.state.pointCount ? "selected" : ""}>${formatCount(count)}</option>`
              ).join("")}
            </select>
          </label>
          <button class="command-button" type="button" id="reset-view">Reset view</button>
          <button class="command-button" type="button" id="clear-selection">Clear selection</button>
          <div class="metric" aria-live="polite">
            <span>FPS</span>
            <strong id="fps" data-testid="fps">0</strong>
          </div>
          <div class="metric">
            <span>Frame</span>
            <strong id="frame-ms" data-testid="frame-ms">0.0ms</strong>
          </div>
          <div class="metric">
            <span>Selected</span>
            <strong id="selection-count" data-testid="selection-count">${this.state.selectedIds.size}</strong>
          </div>
        </section>

        <main class="workspace">
          <section class="stage-panel">
            <div class="stage-heading">
              <div>
                <span class="stage-label">Renderer</span>
                <strong id="active-renderer" data-testid="active-renderer">${ROUTE_LABELS[activeKind]}</strong>
              </div>
              <div class="hover-readout" id="hover-readout" data-testid="hover-readout">No point</div>
            </div>
            <div class="stage" id="stage" data-testid="stage" tabindex="0" aria-label="${ROUTE_LABELS[activeKind]} scatterplot"></div>
          </section>

          <aside class="inspector" aria-label="Viewport state">
            <div class="inspector-row">
              <span>Scale</span>
              <strong id="scale-value">1.000x</strong>
            </div>
            <div class="inspector-row">
              <span>Offset</span>
              <strong id="offset-value">0, 0</strong>
            </div>
            <div class="inspector-row">
              <span>Dataset</span>
              <strong id="dataset-value">${formatCount(this.state.pointCount)}</strong>
            </div>
            <div class="inspector-row">
              <span>Hovered</span>
              <strong id="hovered-value">none</strong>
            </div>
          </aside>
        </main>
      </div>
    `;
    this.stage = this.root.querySelector<HTMLDivElement>("#stage");
  }

  private bindShellEvents(): void {
    this.root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const kind = link.dataset.route as RendererKind;
        history.pushState(null, "", `/${kind}`);
        this.updateRouteUi(kind);
        void this.mountRenderer();
      });
    });

    this.root.querySelector<HTMLSelectElement>("#point-count")?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      this.setPointCount(Number(select.value));
    });

    this.root.querySelector<HTMLButtonElement>("#reset-view")?.addEventListener("click", () => {
      this.resetViewport();
    });

    this.root.querySelector<HTMLButtonElement>("#clear-selection")?.addEventListener("click", () => {
      this.state.selectedIds.clear();
      this.updateReadouts();
    });

    if (this.stage) {
      this.stage.addEventListener("pointerdown", this.handlePointerDown);
      this.stage.addEventListener("pointermove", this.handlePointerMove);
      this.stage.addEventListener("pointerup", this.handlePointerUp);
      this.stage.addEventListener("pointercancel", this.handlePointerCancel);
      this.stage.addEventListener("wheel", this.handleWheel, { passive: false });
    }
  }

  private async mountRenderer(): Promise<void> {
    if (!this.stage) {
      return;
    }

    const token = this.mountToken + 1;
    this.mountToken = token;
    this.renderer?.destroy();
    this.renderer = null;
    this.stage.innerHTML = "";
    this.stage.dataset.renderer = this.getActiveKind();
    this.stage.append(createLoadingMessage(this.getActiveKind()));

    const renderer = createRenderer(this.getActiveKind());
    await renderer.init(this.stage, this.data, this.state);

    if (token !== this.mountToken) {
      renderer.destroy();
      return;
    }

    this.stage.querySelector(".renderer-message--loading")?.remove();
    this.renderer = renderer;
    this.setupResizeObserver();
    this.updateReadouts();
  }

  private setupResizeObserver(): void {
    this.resizeObserver?.disconnect();

    if (!this.stage) {
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      const wasEmpty = this.state.viewport.width <= 1 && this.state.viewport.height <= 1;
      this.state.viewport = {
        ...this.state.viewport,
        width,
        height,
        dpr: getDevicePixelRatio()
      };

      if (wasEmpty) {
        this.resetViewport();
      }

      this.renderer?.resize(this.state.viewport);
      this.updateReadouts();
    });
    this.resizeObserver.observe(this.stage);
  }

  private startAnimationLoop(): void {
    this.frameMeter.reset();

    const renderFrame = (now: number) => {
      window.__WEB_RENDERING_LAB_STATE__ = this.state;
      this.renderer?.render(this.state);
      const stats = this.frameMeter.record(now);
      if (stats) {
        this.root.querySelector("#fps")?.replaceChildren(String(stats.fps));
        this.root.querySelector("#frame-ms")?.replaceChildren(`${stats.averageFrameMs.toFixed(1)}ms`);
      }
      requestAnimationFrame(renderFrame);
    };

    requestAnimationFrame(renderFrame);
  }

  private setPointCount(pointCount: number): void {
    this.state.pointCount = pointCount;
    this.state.selectedIds.clear();
    this.state.hoveredId = null;
    this.data = generatePoints(pointCount);
    this.root.querySelector("#dataset-value")?.replaceChildren(formatCount(pointCount));
    this.resetViewport();
    void this.mountRenderer();
  }

  private resetViewport(): void {
    this.state.viewport = fitViewportToBounds(this.state.viewport, WORLD_BOUNDS);
    this.renderer?.resize(this.state.viewport);
    this.updateReadouts();
  }

  private updateRouteUi(activeKind: RendererKind): void {
    this.root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
      const isActive = link.dataset.route === activeKind;
      link.classList.toggle("is-active", isActive);
      link.setAttribute("aria-current", isActive ? "page" : "false");
    });
    this.root.querySelector("#active-renderer")?.replaceChildren(ROUTE_LABELS[activeKind]);

    if (this.stage) {
      this.stage.setAttribute("aria-label", `${ROUTE_LABELS[activeKind]} scatterplot`);
    }
  }

  private updateReadouts(): void {
    const hovered = this.state.hoveredId === null ? null : this.data[this.state.hoveredId];
    this.root.querySelector("#selection-count")?.replaceChildren(String(this.state.selectedIds.size));
    this.root.querySelector("#scale-value")?.replaceChildren(`${this.state.viewport.scale.toFixed(3)}x`);
    this.root
      .querySelector("#offset-value")
      ?.replaceChildren(`${Math.round(this.state.viewport.offsetX)}, ${Math.round(this.state.viewport.offsetY)}`);
    this.root.querySelector("#hovered-value")?.replaceChildren(hovered ? `#${hovered.id}` : "none");
    this.root
      .querySelector("#hover-readout")
      ?.replaceChildren(hovered ? `#${hovered.id}  ${Math.round(hovered.x)}, ${Math.round(hovered.y)}` : "No point");
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.stage) {
      return;
    }

    const point = this.toStagePoint(event);
    this.dragState = {
      pointerId: event.pointerId,
      start: point,
      previous: point,
      moved: false
    };
    this.stage.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.stage) {
      return;
    }

    const point = this.toStagePoint(event);

    if (this.dragState?.pointerId === event.pointerId) {
      const dx = point.x - this.dragState.previous.x;
      const dy = point.y - this.dragState.previous.y;
      const totalDx = point.x - this.dragState.start.x;
      const totalDy = point.y - this.dragState.start.y;

      if (Math.hypot(totalDx, totalDy) > 4) {
        this.dragState.moved = true;
      }

      if (this.dragState.moved) {
        this.state.viewport = panViewport(this.state.viewport, dx, dy);
      }

      this.dragState.previous = point;
      this.updateReadouts();
      return;
    }

    const hit = this.renderer?.hitTest(point) ?? null;
    this.state.hoveredId = hit?.id ?? null;
    this.updateReadouts();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.stage || this.dragState?.pointerId !== event.pointerId) {
      return;
    }

    const point = this.toStagePoint(event);
    const moved = this.dragState.moved;
    this.dragState = null;
    this.stage.releasePointerCapture(event.pointerId);

    if (!moved) {
      if (event.altKey) {
        for (const id of idsWithinScreenRadius(this.data, this.state.viewport, point, 36)) {
          this.state.selectedIds.add(id);
        }
      } else {
        const hit = this.renderer?.hitTest(point) ?? null;
        if (hit) {
          if (this.state.selectedIds.has(hit.id)) {
            this.state.selectedIds.delete(hit.id);
          } else {
            this.state.selectedIds.add(hit.id);
          }
        }
      }
    }

    this.updateReadouts();
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (this.stage && this.dragState?.pointerId === event.pointerId) {
      this.dragState = null;
      this.stage.releasePointerCapture(event.pointerId);
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const anchor = this.toStagePoint(event);
    const factor = Math.exp(-event.deltaY * 0.0012);
    this.state.viewport = zoomViewportAt(this.state.viewport, anchor, factor);
    this.updateReadouts();
  };

  private handlePopState = (): void => {
    const kind = this.getActiveKind();
    this.updateRouteUi(kind);
    void this.mountRenderer();
  };

  private toStagePoint(event: MouseEvent | PointerEvent | WheelEvent): ScreenPoint {
    if (!this.stage) {
      return { x: 0, y: 0 };
    }

    const rect = this.stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private getActiveKind(): RendererKind {
    return this.getRoute() ?? "dom";
  }

  private getRoute(): RendererKind | null {
    const route = window.location.pathname.replace("/", "");
    if (RENDERER_KINDS.includes(route as RendererKind)) {
      return route as RendererKind;
    }

    return null;
  }
}

function createRenderer(kind: RendererKind): BenchmarkRenderer {
  switch (kind) {
    case "dom":
      return new DomRenderer();
    case "canvas":
      return new CanvasRenderer();
    case "webgl":
      return new WebGLRenderer();
    case "webgpu":
      return new WebGPURenderer();
  }
}

function createLoadingMessage(kind: RendererKind): HTMLDivElement {
  const message = document.createElement("div");
  message.className = "renderer-message renderer-message--loading";
  message.textContent = `Preparing ${ROUTE_LABELS[kind]}`;
  return message;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
