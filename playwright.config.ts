import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e", workers: 1, fullyParallel: false, timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium", viewport: { width: 1440, height: 1000 }, trace: "off", screenshot: "off" },
  webServer: { command: "npm run dev:local", url: "http://127.0.0.1:3100", reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
