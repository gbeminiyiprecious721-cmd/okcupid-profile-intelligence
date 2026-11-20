import { defineConfig } from "@playwright/test";

// Local mode with the exported classifier, for the classification demonstration only.
// A separate backend (port 8001) and page server (port 5174) keep it apart from the public mode run.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.local.spec.ts",
  timeout: 40_000,
  use: { baseURL: "http://127.0.0.1:5174", channel: "chrome" },
  webServer: [
    {
      command: "../backend/.venv/bin/python -m uvicorn profile_api.main:app --port 8001",
      cwd: "../backend",
      url: "http://127.0.0.1:8001/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { PROFILE_APP_MODE: "local", PROFILE_RATE_LIMIT_ENABLED: "false", PROFILE_TIER1_ARTIFACT_DIR: "artifacts/tier1", PROFILE_ALLOWED_ORIGINS: '["http://127.0.0.1:5174"]' },
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { WEB_PORT: "5174", API_TARGET: "http://127.0.0.1:8001" },
    },
  ],
});
