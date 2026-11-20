import { defineConfig } from "@playwright/test";

// The production build, served by `vite preview` with the web application's security headers (security-headers.mjs).
// The same browser tests run against it, plus the checks that no policy violation occurs.
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/*.local.spec.ts"],
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:4173", channel: "chrome" },
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
