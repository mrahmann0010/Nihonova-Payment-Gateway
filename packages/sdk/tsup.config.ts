import { defineConfig } from "tsup";

// ESM + CJS with types for both: sakura-book's API is CommonJS (NestJS), and
// newer apps are ESM. Two entries so the test double never lands in the main
// bundle.
export default defineConfig({
  entry: { index: "src/index.ts", testing: "src/testing/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  target: "node18",
  platform: "node",
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
});
