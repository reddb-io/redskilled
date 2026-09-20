import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist/client",
    assetsInlineLimit: 10_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/chunk-[name].js",
        assetFileNames: "assets/app.[ext]",
      },
    },
  },
  server: {
    proxy: { "/api": { target: "https://localhost:25051", secure: false } },
  },
});
