import type { BenchmarkRenderer, PointData, RenderSize, SceneState } from "../types";

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec3 a_color;
in float a_radius;

uniform vec2 u_resolution;
uniform vec2 u_offset;
uniform float u_scale;
uniform float u_dpr;

out vec3 v_color;

void main() {
  vec2 screen = a_position * u_scale + u_offset;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, a_radius * 2.0 * u_dpr);
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 out_color;

void main() {
  vec2 centered = gl_PointCoord * 2.0 - 1.0;
  float distance_sq = dot(centered, centered);
  if (distance_sq > 1.0) {
    discard;
  }

  float alpha = smoothstep(1.0, 0.72, distance_sq);
  out_color = vec4(v_color, alpha);
}`;

export class WebGLRenderer implements BenchmarkRenderer {
  readonly kind = "webgl" as const;

  private data: PointData[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private size: RenderSize = { width: 1, height: 1, dpr: 1 };

  init(container: HTMLElement, data: PointData[], state: SceneState): void {
    this.data = data;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "render-canvas";
    this.canvas.dataset.rendererCanvas = "webgl";
    this.gl = this.canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true
    });
    container.append(this.canvas);

    if (!this.gl) {
      this.showUnsupported(container);
      return;
    }

    this.program = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);
    this.uploadStaticBuffers(this.gl, this.program, data);
    this.gl.bindVertexArray(null);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
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
    if (!this.gl || !this.program || !this.vao) {
      return;
    }

    const gl = this.gl;
    gl.viewport(0, 0, Math.floor(this.size.width * this.size.dpr), Math.floor(this.size.height * this.size.dpr));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_resolution"), state.viewport.width, state.viewport.height);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_offset"), state.viewport.offsetX, state.viewport.offsetY);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_scale"), state.viewport.scale);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_dpr"), state.viewport.dpr);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.data.length);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    if (this.gl) {
      this.gl.deleteVertexArray(this.vao);
      this.gl.deleteProgram(this.program);
    }

    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.data = [];
  }

  private uploadStaticBuffers(gl: WebGL2RenderingContext, program: WebGLProgram, data: PointData[]): void {
    const positions = new Float32Array(data.length * 2);
    const radii = new Float32Array(data.length);
    const colors = new Float32Array(data.length * 3);

    for (let index = 0; index < data.length; index += 1) {
      const point = data[index];
      positions[index * 2] = point.x;
      positions[index * 2 + 1] = point.y;
      radii[index] = point.radiusPx;
      writeColor(colors, index, point.rgb);
    }

    bindArrayBuffer(gl, program, "a_position", positions, 2);
    bindArrayBuffer(gl, program, "a_color", colors, 3);
    bindArrayBuffer(gl, program, "a_radius", radii, 1);
  }

  private showUnsupported(container: HTMLElement): void {
    const message = document.createElement("div");
    message.className = "renderer-message";
    message.textContent = "WebGL2 is not available in this browser.";
    container.append(message);
  }
}

function bindArrayBuffer(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  attribute: string,
  data: Float32Array,
  size: number
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error(`Failed to create ${attribute} buffer`);
  }

  const location = gl.getAttribLocation(program, attribute);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  return buffer;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Failed to create WebGL program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Failed to link WebGL program");
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to create WebGL shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Failed to compile WebGL shader");
  }

  return shader;
}

function writeColor(target: Float32Array, pointIndex: number, color: readonly [number, number, number]): void {
  target[pointIndex * 3] = color[0];
  target[pointIndex * 3 + 1] = color[1];
  target[pointIndex * 3 + 2] = color[2];
}
