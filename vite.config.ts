import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createBuildInfo, buildInfoPlugin } from "./scripts/build-info.mjs";
export default defineConfig(({ command }) => {
  const info = createBuildInfo({ development: command === "serve" });
  return {
    plugins: [react(), buildInfoPlugin(info)],
    define: { __CYBERNOTE_BUILD_INFO__: JSON.stringify(info) },
    clearScreen: false,
    server: { port: 1420, strictPort: true, host: "0.0.0.0" },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: { target: "chrome90" },
  };
});
