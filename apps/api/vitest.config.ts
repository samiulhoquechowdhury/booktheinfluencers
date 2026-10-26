import { defineConfig } from "vitest/config";

/** E2E tests run against a separate database (talent_test) so dev data is never touched. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://talent:talent@localhost:5442/talent_test";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 600_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      OTP_DEMO_CODE: "123456",
      MFA_DEMO_CODE: "123456",
    },
  },
});
