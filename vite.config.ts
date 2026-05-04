import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/web-rendering-lab/" : "/",
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  }
}));
