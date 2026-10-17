import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleExtract } from "./server/extract.mjs";

function memoryApi(env: Record<string, string>): Plugin {
  return {
    name: "porchlight-memory-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/extract") return next();
        handleExtract(req, res, env);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/extract") return next();
        handleExtract(req, res, env);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), memoryApi(env)],
    server: { port: 5173, strictPort: true },
    optimizeDeps: { include: ["@vladmandic/face-api"] },
  };
});
