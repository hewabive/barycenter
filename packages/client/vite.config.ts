import { defineConfig } from "vite";

export default defineConfig({
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
      input: ["index.html", "atlas.html", "generator.html", "flight.html"],
    },
  },
});
