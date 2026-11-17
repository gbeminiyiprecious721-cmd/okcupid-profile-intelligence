#!/bin/bash
# Run the browser tests in Firefox (and the standalone Firefox axe runner) on Linux, against the running staging container.
# Needs: Colima and Docker running, and the container started with generous rate limits:
#   app/deploy/run_local_staging.sh IMAGE -d -e PROFILE_RATE_LIMIT_SEARCH_PER_MINUTE=100000 -e PROFILE_RATE_LIMIT_GENERAL_PER_MINUTE=100000
# Why a Linux container: Playwright's Firefox does not start on the development Mac (macOS 27.2). Microsoft's Playwright
# image is public and free to pull. The Playwright container shares the staging container's network, so "localhost:8080"
# inside it is the application, and nothing is published anywhere.
# Why a Colima mount: Colima only shares the home folder with its virtual machine, so the work folder is under the project.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="$PWD/deploy/build/ffrun"
IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble"   # must match @playwright/test in frontend/package.json
rm -rf "$WORK" && mkdir -p "$WORK"
cp -R frontend/e2e "$WORK/e2e" && cp frontend/tools/browser-axe.mjs "$WORK/"
cat > "$WORK/package.json" <<'J'
{ "name": "firefox-check", "private": true, "type": "module", "dependencies": { "@playwright/test": "1.65.1", "@axe-core/playwright": "4.14.0" } }
J
cat > "$WORK/playwright.config.ts" <<'J'
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/*.local.spec.ts", "**/perf.prod.spec.ts"],
  timeout: 90_000,
  workers: 1,
  projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"], baseURL: "http://127.0.0.1:8080" } }],
});
J
docker run --rm --network container:pi-staging --shm-size=2g -v "$WORK":/work -w /work "$IMAGE" bash -c '
  npm install --silent --no-audit --no-fund
  echo "== standalone axe runner in Firefox (fresh context per check)"; node browser-axe.mjs firefox
  echo "== Playwright test suites in Firefox"; npx playwright test --reporter=line 2>&1 | grep -E "[0-9]+ (passed|failed|skipped|flaky)|^\s+[0-9]+\) |Error:" | cut -c1-220'
