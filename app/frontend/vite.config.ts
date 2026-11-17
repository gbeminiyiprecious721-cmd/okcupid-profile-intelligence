import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { SECURITY_HEADERS } from "./security-headers.mjs";

// In development the API runs on port 8000 and is reached through this proxy,
// so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.WEB_PORT ?? 5173), proxy: { "/api": process.env.API_TARGET ?? "http://127.0.0.1:8000" } },
  preview: { port: Number(process.env.WEB_PORT ?? 4173), headers: SECURITY_HEADERS, proxy: { "/api": process.env.API_TARGET ?? "http://127.0.0.1:8000" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
