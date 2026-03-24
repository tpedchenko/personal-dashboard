import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://dev.taras.cloud",
    trace: "on-first-retry",
  },
  projects: [
    // No-auth smoke tests
    {
      name: "smoke",
      use: { browserName: "chromium" },
      testMatch: /smoke\.spec|api-health\.spec|api-routes\.spec/,
    },
    // Dev with demo auth (all tests)
    {
      name: "dev-demo",
      use: {
        browserName: "chromium",
        storageState: "tests/demo-auth-dev.json",
        baseURL: "https://dev.taras.cloud",
      },
      testIgnore: /smoke\.spec|api-health\.spec/,
    },
    // Prod no-auth smoke
    {
      name: "prod-smoke",
      use: {
        browserName: "chromium",
        baseURL: "https://pd.taras.cloud",
      },
      testMatch: /smoke\.spec|api-health\.spec|api-routes\.spec/,
    },
    // Prod with demo auth (full demo suite)
    {
      name: "prod-demo",
      timeout: 60000,
      use: {
        browserName: "chromium",
        storageState: "tests/demo-auth-prod.json",
        baseURL: "https://pd.taras.cloud",
      },
      testIgnore: /smoke\.spec|api-health\.spec/,
    },
  ],
});
