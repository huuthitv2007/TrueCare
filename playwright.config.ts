import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5273",
    headless: false,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    env: {
      TRUECARE_DATA_DIR: ".local/metronic-qa-data",
      PORT: "5311",
      TRUECARE_API_PORT: "5311",
      TRUECARE_WEB_PORT: "5273",
    },
    url: "http://127.0.0.1:5273/api/health",
    reuseExistingServer: true,
    timeout: 45_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testIgnore: /metronic-matrix/,
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          // Keep headed Windows test windows rendering when another window
          // covers them; otherwise Firefox suspends actionability animation frames.
          firefoxUserPrefs: { "widget.windows.window_occlusion_tracking.enabled": false },
        },
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
