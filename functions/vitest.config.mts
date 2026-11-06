import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Build output contains CommonJS copies that Vitest must not collect.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
