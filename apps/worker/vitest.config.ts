import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 15000,
    // Some suites hit a shared Postgres instance (DATABASE_URL-gated) —
    // same fileParallelism gotcha documented in packages/db/vitest.config.ts.
    fileParallelism: false,
  },
});
