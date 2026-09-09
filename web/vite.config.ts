import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const experienceRoot = path.resolve(root, "../gateway/src/experience");

export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@pa/experience": experienceRoot,
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [root, path.resolve(root, "..")],
    },
    proxy: {
      "/health": "http://127.0.0.1:8787",
      "/workspaces": "http://127.0.0.1:8787",
      "/conversations": "http://127.0.0.1:8787",
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
