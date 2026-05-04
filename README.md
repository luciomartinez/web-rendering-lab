# Web Rendering Lab

> DOM vs Canvas 2D vs WebGL2 vs WebGPU

Compare browser rendering strategies with the same deterministic scatterplot workload.

## Try It

[https://luciomartinez.github.io/web-rendering-lab/](https://luciomartinez.github.io/web-rendering-lab/)

## Quick Summary

- DOM - purely DOM rendering of elements
- Canvas 2D - 2D rendering with the HTML canvas API
- WebGL2 - de-facto standard for performant GPU rendering in browsers
- WebGPU - new standard for performant 2D rendering

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
