import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    // Needs Docker MongoDB + apps/server; run with `npm run test:contract`.
    exclude: ["test/contract/**"],
    environment: "node",
  },
});
