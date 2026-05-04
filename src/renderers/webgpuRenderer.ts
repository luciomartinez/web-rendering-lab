import type { BenchmarkRenderer, PointData, RenderSize, SceneState, ScreenPoint } from "../types";
import { nearestPoint } from "../viewport";

const SHADER = `
struct Uniforms {
  resolution: vec2f,
  offset: vec2f,
  scale: f32,
  dpr: f32,
  padding: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) local: vec2f,
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) pointPosition: vec2f,
  @location(1) pointColor: vec3f,
  @location(2) pointRadius: f32
) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0)
  );

  let local = corners[vertexIndex];
  let screen = pointPosition * uniforms.scale + uniforms.offset + local * pointRadius;
  let clip = screen / uniforms.resolution * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);

  var output: VertexOut;
  output.position = vec4f(clip, 0.0, 1.0);
  output.color = pointColor;
  output.local = local;
  return output;
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
  let distanceSq = dot(input.local, input.local);
  if (distanceSq > 1.0) {
    discard;
  }

  let alpha = smoothstep(1.0, 0.72, distanceSq);
  return vec4f(input.color, alpha);
}`;

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<any>;
    getPreferredCanvasFormat: () => string;
  };
};

type WebGpuGlobals = typeof globalThis & {
  GPUBufferUsage: Record<"UNIFORM" | "COPY_DST" | "VERTEX", number>;
  GPUShaderStage: Record<"VERTEX", number>;
};

export class WebGPURenderer implements BenchmarkRenderer {
  readonly kind = "webgpu" as const;

  private data: PointData[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private device: any = null;
  private context: any = null;
  private pipeline: any = null;
  private bindGroup: any = null;
  private uniformBuffer: any = null;
  private pointBuffer: any = null;
  private pointData = new Float32Array();
  private lastColorSignature = "";
  private message: HTMLDivElement | null = null;

  async init(container: HTMLElement, data: PointData[], state: SceneState): Promise<void> {
    this.data = data;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "render-canvas";
    this.canvas.dataset.rendererCanvas = "webgpu";
    container.append(this.canvas);

    const gpu = (navigator as GpuNavigator).gpu;
    if (!gpu) {
      this.showUnsupported(container, "WebGPU is not available in this browser.");
      return;
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      this.showUnsupported(container, "WebGPU adapter could not be created.");
      return;
    }

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");

    if (!this.context) {
      this.showUnsupported(container, "WebGPU canvas context is unavailable.");
      return;
    }

    const format = gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format,
      alphaMode: "premultiplied"
    });

    this.createPipeline(format);
    this.uploadPoints(state);
    this.resize(state.viewport);
    this.render(state);
  }

  resize(size: RenderSize): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.style.width = `${size.width}px`;
    this.canvas.style.height = `${size.height}px`;
    this.canvas.width = Math.max(1, Math.floor(size.width * size.dpr));
    this.canvas.height = Math.max(1, Math.floor(size.height * size.dpr));
  }

  render(state: SceneState): void {
    if (!this.device || !this.context || !this.pipeline || !this.bindGroup || !this.pointBuffer) {
      return;
    }

    this.updatePointColors(state);
    this.writeUniforms(state);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.pointBuffer);
    pass.draw(6, this.data.length);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
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
    this.message?.remove();
    this.canvas = null;
    this.message = null;
    this.device = null;
    this.context = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.uniformBuffer = null;
    this.pointBuffer = null;
    this.pointData = new Float32Array();
    this.lastColorSignature = "";
  }

  private createPipeline(format: string): void {
    const gpuGlobals = globalThis as WebGpuGlobals;
    const shaderModule = this.device.createShaderModule({ code: SHADER });
    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: gpuGlobals.GPUBufferUsage.UNIFORM | gpuGlobals.GPUBufferUsage.COPY_DST
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: gpuGlobals.GPUShaderStage.VERTEX,
          buffer: { type: "uniform" }
        }
      ]
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer }
        }
      ]
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 24,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x3" },
              { shaderLocation: 2, offset: 20, format: "float32" }
            ]
          }
        ]
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add"
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add"
              }
            }
          }
        ]
      },
      primitive: {
        topology: "triangle-list"
      }
    });
  }

  private uploadPoints(state: SceneState): void {
    const gpuGlobals = globalThis as WebGpuGlobals;
    this.pointData = new Float32Array(this.data.length * 6);
    this.writePointData(state);
    this.pointBuffer = this.device.createBuffer({
      size: this.pointData.byteLength,
      usage: gpuGlobals.GPUBufferUsage.VERTEX | gpuGlobals.GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.pointBuffer, 0, this.pointData);
  }

  private updatePointColors(state: SceneState): void {
    const signature = `${state.hoveredId ?? "none"}:${Array.from(state.selectedIds).sort((a, b) => a - b).join(",")}`;
    if (signature === this.lastColorSignature) {
      return;
    }

    this.writePointData(state);
    this.device.queue.writeBuffer(this.pointBuffer, 0, this.pointData);
    this.lastColorSignature = signature;
  }

  private writePointData(state: SceneState): void {
    for (let index = 0; index < this.data.length; index += 1) {
      const point = this.data[index];
      const offset = index * 6;
      this.pointData[offset] = point.x;
      this.pointData[offset + 1] = point.y;

      if (state.hoveredId === point.id) {
        this.pointData[offset + 2] = 0.972;
        this.pointData[offset + 3] = 0.98;
        this.pointData[offset + 4] = 0.988;
      } else if (state.selectedIds.has(point.id)) {
        this.pointData[offset + 2] = 0.961;
        this.pointData[offset + 3] = 0.62;
        this.pointData[offset + 4] = 0.043;
      } else {
        this.pointData[offset + 2] = point.rgb[0];
        this.pointData[offset + 3] = point.rgb[1];
        this.pointData[offset + 4] = point.rgb[2];
      }

      this.pointData[offset + 5] = point.radiusPx;
    }
  }

  private writeUniforms(state: SceneState): void {
    const uniformData = new Float32Array([
      state.viewport.width,
      state.viewport.height,
      state.viewport.offsetX,
      state.viewport.offsetY,
      state.viewport.scale,
      state.viewport.dpr,
      0,
      0
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  private showUnsupported(container: HTMLElement, text: string): void {
    this.message = document.createElement("div");
    this.message.className = "renderer-message";
    this.message.textContent = text;
    container.append(this.message);
  }
}
