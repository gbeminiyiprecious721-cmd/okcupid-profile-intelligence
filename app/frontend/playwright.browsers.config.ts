import { defineConfig, devices } from "@playwright/test";

// Firefox and WebKit (the engine of Safari) against the production build. Chrome is covered by playwright.prod.config.ts.
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/*.local.spec.ts", "**/perf.prod.spec.ts"], // performance runs on Chrome only
  timeout: 60_000,
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"], baseURL: "http://127.0.0.1:4173" } },
    { name: "webkit", use: { ...devices["Desktop Safari"], baseURL: "http://127.0.0.1:4173" } },
  ],
  webServer: [
    {
      command: "../backend/.venv/bin/python -m uvicorn profile_api.main:app --port 8000 --no-server-header --no-access-log",
      cwd: "../backend",
      url: "http://127.0.0.1:8000/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { PROFILE_APP_MODE: "public", PROFILE_RATE_LIMIT_ENABLED: "false" },
    },
    { command: "npm run build && npm run preview -- --host 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: true, timeout: 180_000 },
  ],
});
