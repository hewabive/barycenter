import { defineConfig } from "vite";

const STANDALONE = ["index.html", "flight.html", "atlas.html"];

export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5183,
    proxy: {
      "/socket": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  build: {
    target: "es2023",
    rollupOptions: {
      input: mode === "pages" ? STANDALONE : [...STANDALONE, "strategy.html"],
    },
  },
}));
