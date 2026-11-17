import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Page load measurements on the production build. Chrome only, because they use its tracing events and throttling.
// Desktop is unthrottled. The phone profile uses a 4 times slower CPU and a "slow 4G" connection.
const ROUTES = ["/", "/discover", "/lab", "/lab/models", "/lab/classify"];
const PROFILES = {
  desktop: { size: { width: 1280, height: 800 }, cpu: 1, net: null },
  phone: { size: { width: 390, height: 844 }, cpu: 4, net: { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 } },
} as const;
const results: Record<string, unknown>[] = [];

for (const [profile, cfg] of Object.entries(PROFILES)) {
  for (const route of ROUTES) {
    test(`${profile} load of ${route}`, async ({ page, context }) => {
      await page.setViewportSize(cfg.size);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      if (cfg.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cfg.cpu });
      if (cfg.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: cfg.net.latency, downloadThroughput: cfg.net.down, uploadThroughput: cfg.net.up });
      await page.addInitScript(() => {
        const w = window as unknown as { __lcp: number; __cls: number };
        w.__lcp = 0;
        w.__cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => !(e as unknown as { hadRecentInput: boolean }).hadRecentInput && (w.__cls += (e as unknown as { value: number }).value))).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
        const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const w = window as unknown as { __lcp: number; __cls: number };
        const bytes = (kind: (r: PerformanceResourceTiming) => boolean) => res.filter(kind).reduce((n, r) => n + (r.transferSize || 0), 0);
        return {
          fcp: Math.round(fcp),
          lcp: Math.round(w.__lcp),
          cls: Number(w.__cls.toFixed(3)),
          dom_content_loaded: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
          requests: res.length + 1,
          transfer_kb: Math.round((nav.transferSize + bytes(() => true)) / 1024),
          js_kb: Math.round(bytes((r) => r.name.endsWith(".js")) / 1024),
          fonts_kb: Math.round(bytes((r) => r.name.endsWith(".woff2")) / 1024),
          api_requests: res.filter((r) => r.name.includes("/api/")).length,
        };
      });
      results.push({ profile, route, ...m });
      // Core Web Vitals "good" thresholds: LCP 2.5 s, CLS 0.1. Generous for the throttled phone profile.
      expect(m.lcp, "largest contentful paint").toBeLessThan(profile === "phone" ? 4000 : 2500);
      expect(m.cls, "layout shift").toBeLessThan(0.1);
      expect(m.js_kb, "javascript transferred").toBeLessThan(250);
    });
  }
}

// Layout shift while the page is used: type, search, and let the results and the gold lines finish arriving.
const searchShifts: Record<string, unknown>[] = [];
for (const [profile, cfg] of Object.entries(PROFILES)) {
  test(`${profile}: a search on /discover shifts the layout very little`, async ({ page, context }) => {
    await page.setViewportSize(cfg.size);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    if (cfg.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cfg.cpu });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !(e as unknown as { hadRecentInput: boolean }).hadRecentInput && (w.__cls += (e as unknown as { value: number }).value))).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/discover", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in second hand bookshops, drink too much tea, and write poems and short novels in a notebook.");
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    await expect(page.getByTestId("input-summary")).toBeVisible();
    await page.waitForTimeout(2500); // the cards fade in and the lines draw
    const after = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    const duringSearch = Math.round((after - before) * 1000) / 1000;
    searchShifts.push({ profile, shift_during_search: duringSearch });
    expect(duringSearch, "layout shift during a search").toBeLessThan(0.1);
  });
}

test.afterAll(() => {
  mkdirSync("../planning", { recursive: true });
  writeFileSync(process.env.PERF_OUT ?? "../planning/phase7_frontend_performance.json", JSON.stringify(results, null, 2) + "\n");
  if (searchShifts.length) writeFileSync(process.env.PERF_SEARCH_OUT ?? "../planning/phase9b/search_layout_shift.json", JSON.stringify(searchShifts, null, 2) + "\n");
});
