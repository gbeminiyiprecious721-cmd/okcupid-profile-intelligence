import { defineConfig, devices } from "@playwright/test";

// The browser suites against a container that is already running (for example one started from app/deploy/Dockerfile).
// The container serves the web application itself, so there is nothing else to start.
// Start the container with generous rate limits for this run: the tests send far more searches than a person would.
const baseURL = process.env.CONTAINER_URL ?? "http://127.0.0.1:8080";
export default defineConfig({
  testDir: "e2e",
  testIgnore: ["**/*.local.spec.ts", "**/perf.prod.spec.ts"],
  timeout: 60_000,
  projects: [
    { name: "chrome", use: { baseURL, channel: "chrome" } },
    { name: "webkit", use: { ...devices["Desktop Safari"], baseURL } },
    // Phone profiles: touch input, a mobile user agent and the device's screen. Tests that set their own viewport keep it.
    { name: "iphone-15", use: { ...devices["iPhone 15"], baseURL } },
    { name: "pixel-7", use: { ...devices["Pixel 7"], channel: "chrome", baseURL } },
  ],
});
