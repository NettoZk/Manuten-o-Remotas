import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e", workers: 1, fullyParallel: false, timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: process.env.REMOTAS_E2E_BASE_URL || "http://127.0.0.1:3101", browserName: "chromium", viewport: { width: 1440, height: 1000 }, trace: "off", screenshot: "off", video: "off" },
  webServer: { command: "npm run dev:local", url: process.env.REMOTAS_E2E_BASE_URL || "http://127.0.0.1:3101", reuseExistingServer: false, timeout: 120_000 },
})
