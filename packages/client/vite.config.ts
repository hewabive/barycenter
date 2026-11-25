import { execSync } from "node:child_process";
import { defineConfig } from "vite";

const STANDALONE = ["index.html", "flight.html", "atlas.html"];

const build = () => {
  try {
    return execSync("git describe --always --dirty", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export default defineConfig(({ mode }) => ({
  base: "./",
  define: {
    "import.meta.env.VITE_BUILD": JSON.stringify(build()),
  },
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
