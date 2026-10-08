import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 1000 } } }],
  webServer: { command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run dev`, url: "http://127.0.0.1:3000", reuseExistingServer: true },
});
