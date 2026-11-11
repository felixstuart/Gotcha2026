import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Emulator suites share aggregate documents and must not reset them concurrently.
    fileParallelism: false,
    // Build output contains CommonJS copies that Vitest must not collect.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
