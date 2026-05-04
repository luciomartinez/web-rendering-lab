# Web Rendering Lab

> DOM vs Canvas vs WebGL vs WebGPU

Experiments comparing rendering strategies for large-scale interactive visualizations.

## Demos

This repository includes 4 demos:

- DOM - purely DOM rendering of elements
- Canvas - 2D rendering on Canvas using HTML5
- WebGL - de-facto standard for performant 2D rendering
- WebGPU - new standard for performant 2D rendering

Each demo renders the same deterministic scatterplot with shared pan, zoom, and FPS metrics.

DOM opens at 1k points to avoid locking up the browser. Canvas, WebGL2, and WebGPU open at 100k points and include a 1M-point option for heavier comparisons.

## Run

```sh
npm install
npm run dev
```

Open:

- `http://localhost:5173/dom`
- `http://localhost:5173/canvas`
- `http://localhost:5173/webgl`
- `http://localhost:5173/webgpu`

## Check

```sh
npm run typecheck
npm run build
npm test
```
