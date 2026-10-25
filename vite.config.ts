import { createReadStream, cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleAsk } from "./server/ask.mjs";
import { handleExtract } from "./server/extract.mjs";

const MEDIAPIPE_WASM = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

function mediapipeWasm(): Plugin {
  const wasmDir = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
  const serve: Plugin["configureServer"] = (server) => {
    server.middlewares.use((req, res, next) => {
      const url = req.url?.split("?")[0] ?? "";
      if (!url.startsWith("/mediapipe/")) return next();
      const name = path.basename(url);
      if (!MEDIAPIPE_WASM.includes(name)) return next();
      const full = path.join(wasmDir, name);
      if (!existsSync(full)) return next();
      res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
      createReadStream(full).pipe(res);
    });
  };
  return {
    name: "mediapipe-wasm",
    configureServer: serve,
    configurePreviewServer: serve,
    closeBundle() {
      const dist = path.resolve("dist/mediapipe");
      mkdirSync(dist, { recursive: true });
      for (const name of MEDIAPIPE_WASM) cpSync(path.join(wasmDir, name), path.join(dist, name));
    },
  };
}

function memoryApi(env: Record<string, string>): Plugin {
  return {
    name: "recallai-memory-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/api/extract") handleExtract(req, res, env);
        else if (path === "/api/ask") handleAsk(req, res, env);
        else next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/api/extract") handleExtract(req, res, env);
        else if (path === "/api/ask") handleAsk(req, res, env);
        else next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), memoryApi(env), mediapipeWasm()],
    server: { port: 5173, strictPort: true },
    worker: { format: "es" },
    optimizeDeps: { include: ["@vladmandic/face-api"] },
  };
});
