import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Same-origin `/api` and `/health` requests are proxied to the API in both `vite dev` and `vite preview`.
 * Set `VITE_API_URL` when serving the built app without this proxy (e.g. CDN + separate API host).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:3001";
  const proxy = {
    "/api": {
      target: apiTarget,
      changeOrigin: true,
    },
    "/health": {
      target: apiTarget,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 5173,
      proxy,
    },
  };
});
