// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // src/generated is written by the Gotcha2026 repo's scripts/generate-clients.mjs
    ignores: ["dist/*", "src/generated/*"],
  }
]);
