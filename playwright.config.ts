import { defineConfig, devices } from "@playwright/test";

const baseURL=process.env.PLAYWRIGHT_BASE_URL??"http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 1000 } } }],
  webServer: { command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run ${process.env.CI?'start':'dev'} -- --port ${new URL(baseURL).port||'3000'}`, url: baseURL, reuseExistingServer: !process.env.CI },
});
