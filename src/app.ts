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
  panViewport,
  zoomViewportAt
} from "./viewport";

const ROUTE_LABELS: Record<RendererKind, string> = {
  dom: "DOM",
  canvas: "Canvas 2D",
  webgl: "WebGL2",
  webgpu: "WebGPU"
};

const DOM_DEFAULT_POINT_COUNT = 1_000;
const DOM_POINT_COUNT_OPTIONS = [1_000, 5_000, 10_000, 25_000];
const ACCELERATED_POINT_COUNT_OPTIONS = [1_000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

export class RenderingLabApp {
  private root: HTMLElement;
  private stage: HTMLDivElement | null = null;
  private renderer: BenchmarkRenderer | null = null;
  private activeKind: RendererKind;
  private data: PointData[];
  private state: SceneState;
  private pointCountsByRenderer: Record<RendererKind, number> = {
    dom: DOM_DEFAULT_POINT_COUNT,
    canvas: DEFAULT_POINT_COUNT,
    webgl: DEFAULT_POINT_COUNT,
    webgpu: DEFAULT_POINT_COUNT
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
    this.activeKind = this.getRoute() ?? "dom";
    const pointCount = this.getDefaultPointCount(this.activeKind);
    this.data = generatePoints(pointCount);
    this.state = {
      pointCount,
      hoveredId: null,
      viewport: createViewport(1, 1)
    };
  }

  start(): void {
    const route = this.getRoute();
    if (!route) {
      history.replaceState(null, "", "/dom");
      this.activeKind = "dom";
    }

    this.renderShell();
    this.bindShellEvents();
    void this.mountRenderer();
    this.startAnimationLoop();
    window.addEventListener("popstate", this.handlePopState);
  }

  private renderShell(): void {
    const activeKind = this.activeKind;
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
              ${this.renderPointCountOptions(activeKind)}
            </select>
          </label>
          <button class="command-button" type="button" id="reset-view">Reset view</button>
          <div class="metric" aria-live="polite">
            <span>FPS</span>
            <strong id="fps" data-testid="fps">0</strong>
          </div>
          <div class="metric">
            <span>Frame</span>
            <strong id="frame-ms" data-testid="frame-ms">0.0ms</strong>
          </div>
          <div class="metric metric--wide">
            <span>Hovered</span>
            <strong id="hovered-value" data-testid="hovered-value">none</strong>
          </div>
        </section>

        <main class="workspace">
          <section class="stage-panel">
            <div class="stage" id="stage" data-testid="stage" tabindex="0" aria-label="${ROUTE_LABELS[activeKind]} scatterplot"></div>
          </section>
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
        this.switchRenderer(kind);
      });
    });

    this.root.querySelector<HTMLSelectElement>("#point-count")?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      this.setPointCount(Number(select.value));
    });

    this.root.querySelector<HTMLButtonElement>("#reset-view")?.addEventListener("click", () => {
      this.resetViewport();
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
    this.stage.dataset.renderer = this.activeKind;
    this.stage.append(createLoadingMessage(this.activeKind));

    const renderer = createRenderer(this.activeKind);
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
    if (pointCount === this.state.pointCount) {
      return;
    }

    this.pointCountsByRenderer[this.activeKind] = pointCount;
    this.state.pointCount = pointCount;
    this.state.hoveredId = null;
    this.data = generatePoints(pointCount);
    this.resetViewport();
    void this.mountRenderer();
  }

  private resetViewport(): void {
    this.state.viewport = fitViewportToBounds(this.state.viewport, WORLD_BOUNDS);
    this.renderer?.resize(this.state.viewport);
    this.updateReadouts();
  }

  private switchRenderer(nextKind: RendererKind): void {
    if (nextKind === this.activeKind) {
      return;
    }

    this.pointCountsByRenderer[this.activeKind] = this.state.pointCount;
    this.activeKind = nextKind;
    const nextPointCount = this.getRememberedPointCount(nextKind);

    if (nextPointCount !== this.state.pointCount) {
      this.state.pointCount = nextPointCount;
      this.state.hoveredId = null;
      this.data = generatePoints(nextPointCount);
      this.resetViewport();
    }

    this.updateRouteUi(nextKind);
    void this.mountRenderer();
  }

  private updateRouteUi(activeKind: RendererKind): void {
    this.root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
      const isActive = link.dataset.route === activeKind;
      link.classList.toggle("is-active", isActive);
      link.setAttribute("aria-current", isActive ? "page" : "false");
    });
    this.updatePointCountSelect(activeKind);

    if (this.stage) {
      this.stage.setAttribute("aria-label", `${ROUTE_LABELS[activeKind]} scatterplot`);
    }
  }

  private updateReadouts(): void {
    const hovered = this.state.hoveredId === null ? null : this.data[this.state.hoveredId];
    this.root.querySelector("#hovered-value")?.replaceChildren(hovered ? `#${hovered.id}` : "none");
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

    const moved = this.dragState.moved;
    this.dragState = null;
    this.stage.releasePointerCapture(event.pointerId);

    if (moved) {
      this.updateReadouts();
    }
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
    this.switchRenderer(this.getRoute() ?? "dom");
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

  private getRoute(): RendererKind | null {
    const route = window.location.pathname.replace("/", "");
    if (RENDERER_KINDS.includes(route as RendererKind)) {
      return route as RendererKind;
    }

    return null;
  }

  private getRememberedPointCount(kind: RendererKind): number {
    const rememberedCount = this.pointCountsByRenderer[kind];
    const options = this.getPointCountOptions(kind);

    if (options.includes(rememberedCount)) {
      return rememberedCount;
    }

    return this.getDefaultPointCount(kind);
  }

  private getDefaultPointCount(kind: RendererKind): number {
    return kind === "dom" ? DOM_DEFAULT_POINT_COUNT : DEFAULT_POINT_COUNT;
  }

  private getPointCountOptions(kind: RendererKind): number[] {
    return kind === "dom" ? DOM_POINT_COUNT_OPTIONS : ACCELERATED_POINT_COUNT_OPTIONS;
  }

  private updatePointCountSelect(kind: RendererKind): void {
    const select = this.root.querySelector<HTMLSelectElement>("#point-count");

    if (!select) {
      return;
    }

    select.innerHTML = this.renderPointCountOptions(kind);
    select.value = String(this.state.pointCount);
  }

  private renderPointCountOptions(kind: RendererKind): string {
    return this.getPointCountOptions(kind)
      .map(
        (count) =>
          `<option value="${count}" ${count === this.state.pointCount ? "selected" : ""}>${formatCount(count)}</option>`
      )
      .join("");
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
