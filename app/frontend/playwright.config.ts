import { defineConfig } from "@playwright/test";

// Uses the Chrome already installed on the machine, so no browser download is needed.
// The backend is started in public mode on purpose: that is the only mode that may be deployed.
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/*.local.spec.ts", "**/*.prod.spec.ts"], // these need a local mode backend, see playwright.local.config.ts
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5173", channel: "chrome" },
  webServer: [
    {
      command: "../backend/.venv/bin/python -m uvicorn profile_api.main:app --port 8000",
      cwd: "../backend",
      url: "http://127.0.0.1:8000/api/v1/health",
      reuseExistingServer: true,
      env: { PROFILE_APP_MODE: "public", PROFILE_RATE_LIMIT_ENABLED: "false" },
    },
    { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", reuseExistingServer: true },
  ],
});
