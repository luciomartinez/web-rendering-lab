# Web Rendering Lab

> DOM vs Canvas 2D vs WebGL2 vs WebGPU

Compare browser rendering strategies with the same deterministic scatterplot workload.

## Try It

[https://luciomartinez.github.io/web-rendering-lab/](https://luciomartinez.github.io/web-rendering-lab/)

## Summary

- DOM - one HTML element per point
- Canvas 2D - immediate-mode drawing with the canvas API
- WebGL2 - GPU rendering through the widely supported WebGL API
- WebGPU - GPU rendering through the newer WebGPU API when available

Each demo shares the same data, pan/zoom controls, point-count presets, and FPS metric so the rendering tradeoffs are easier to compare.

## Screenshots

| Desktop | Mobile |
| --- | --- |
| <img src="./demo_desktop.png" alt="Desktop demo of Web Rendering Lab" width="720"> | <img src="./demo_mobile.png" alt="Mobile demo of Web Rendering Lab" width="260"> |

## Development

Run locally:

```sh
npm install
npm run dev
```

[http://localhost:5173](http://localhost:5173)

Run checks:

```sh
npm run typecheck
npm run build
npm test
```

Deployments are published to GitHub Pages from `main` with GitHub Actions.
