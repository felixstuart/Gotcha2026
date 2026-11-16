module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
    "/src/generated/**/*", // buildings from scripts/generate-buildings.mjs
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    // Match the codebase's existing style (2-space indent, spaced braces, ~120-col lines).
    "indent": ["error", 2],
    "object-curly-spacing": ["error", "always"],
    "max-len": ["error", { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }],
    // Deprecated in ESLint core; TypeScript types already document params/returns.
    "valid-jsdoc": 0,
    "require-jsdoc": 0,
  },
};
