import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@scrapers': path.resolve(__dirname, './src/scrapers'),
      '@matching': path.resolve(__dirname, './src/matching'),
      '@notion': path.resolve(__dirname, './src/notion'),
      '@pipeline': path.resolve(__dirname, './src/pipeline'),
      '@storage': path.resolve(__dirname, './src/storage'),
      '@jina': path.resolve(__dirname, './src/jina'),
      '@progress': path.resolve(__dirname, './src/progress'),
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
