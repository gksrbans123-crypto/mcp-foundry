import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests talk to a real Postgres and can take longer than
    // vitest's 5s default, especially the first query after container start.
    testTimeout: 15000,
    // Every integration file truncates shared tables against the same
    // external Postgres instance in beforeEach; running files concurrently
    // lets one file's truncate race another file's in-flight test.
    fileParallelism: false,
  },
});
