import { defineConfig } from "vitest/config";

/** Own database, so API and worker suites can run at the same time without reseeding each other. */
export const TEST_DATABASE_URL =
  process.env.WORKER_TEST_DATABASE_URL ?? (process.env.TEST_DATABASE_URL ?? "postgresql://talent:talent@localhost:5442/talent_test").replace(/talent_test$/, "talent_worker_test");

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 600_000,
    env: { NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL },
  },
});
