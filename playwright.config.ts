import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: !process.env.CI,
        env: { DEMO_MODE: "true", DEMO_DATA_DIR: ".data/e2e" },
        timeout: 120000,
      },
});
