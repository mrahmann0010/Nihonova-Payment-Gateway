import { defineConfig } from "vitest/config";

// The SDK against a real gateway (apps/server) and the local Docker MongoDB.
// Kept out of `npm test` because it needs both running; see test/contract/.
export default defineConfig({
  test: {
    include: ["test/contract/**/*.contract.spec.ts"],
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // One server and one database for the whole run; tests share seeded data.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
