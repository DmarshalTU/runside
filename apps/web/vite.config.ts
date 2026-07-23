import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative assets so the UI works from Tauri custom protocol and from http://127.0.0.1
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/reports": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
