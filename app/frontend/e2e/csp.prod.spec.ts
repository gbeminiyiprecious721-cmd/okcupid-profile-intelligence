import { expect, test, type Page } from "@playwright/test";

// These run against the production build served with the web application's security headers (playwright.prod.config.ts).
const ROUTES = ["/", "/discover", "/lab", "/lab/segments", "/lab/models", "/lab/similarity", "/lab/fairness", "/lab/classify", "/about", "/no/such/page"];

async function watch(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(String(e)));
  return problems;
}

test("the production build is served with the security headers", async ({ request }) => {
  const response = await request.get("/");
  const h = response.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).toContain("script-src 'self'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["permissions-policy"]).toContain("camera=()");
});

for (const route of ROUTES) {
  test(`no policy violation, console error or page error on ${route}`, async ({ page }) => {
    const problems = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(violations).toEqual([]);
    expect(problems.filter((p) => !p.includes("404"))).toEqual([]); // the unknown page's own 404 is expected
  });
}

test("a full Discovery and Lab journey under the policy: dialogs, charts and the mobile menu all work", async ({ page }) => {
  const problems = await watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");
  await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in bookshops and drink too much tea.");
  await page.getByRole("button", { name: "Find similar profiles" }).click();
  await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
  await page.getByTestId("result-embeddings-1").getByRole("button", { name: /^View profile/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Model performance" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Model performance" })).toBeVisible();
  await page.getByRole("button", { name: "Show as table" }).first().click();
  await expect(page.getByRole("table").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  expect(problems).toEqual([]);
});

test("a rate limited answer is explained and keeps what was typed", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/discover");
  await page.route("**/discover/similar", (route) =>
    route.fulfill({ status: 429, headers: { "Retry-After": "12", "Content-Type": "application/json" }, body: JSON.stringify({ error: { code: "rate_limited", message: "Too many requests. Try again in 12 seconds." } }) }),
  );
  await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in bookshops and drink too much tea.");
  await page.getByRole("button", { name: "Find similar profiles" }).click();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(page.getByRole("alert")).toContainText("Try again in 12 seconds");
  await expect(page.getByRole("textbox", { name: "Profile text" })).toHaveValue(/bookshops/);
});

test("browser storage holds only the theme choice, after visiting and using every page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const route of ROUTES.slice(0, 9)) {
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
  }
  await page.goto("/discover");
  await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in bookshops and drink too much tea.");
  await page.getByRole("button", { name: "Find similar profiles" }).click();
  await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
  await page.getByRole("group", { name: "Colour theme" }).getByRole("button", { name: "Dark" }).click();
  const stored = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookie: document.cookie,
    databases: "databases" in indexedDB ? (await indexedDB.databases()).length : 0,
    workers: (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0,
    caches: "caches" in window ? (await caches.keys()).length : 0,
  }));
  expect(stored).toEqual({ local: ["pi-theme"], session: [], cookie: "", databases: 0, workers: 0, caches: 0 });
  expect(await page.evaluate(() => localStorage.getItem("pi-theme"))).toBe("dark");
});
