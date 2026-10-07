import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["test/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
