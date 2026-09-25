import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        popout: path.resolve(__dirname, "src/popout.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
