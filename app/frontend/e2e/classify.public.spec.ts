import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.SHOT_DIR;
const SIZES = { desktop: { width: 1360, height: 900 }, mobile: { width: 390, height: 844 } };

async function open(page: Page, scheme: "light" | "dark" = "light") {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto("/lab/classify");
  await expect(page.getByRole("heading", { level: 1, name: "Classification evidence" })).toBeVisible();
  await expect(page.getByRole("figure").first()).toBeVisible();
}
const exampleRadios = (page: Page) => page.locator("input[name=example]");

test.describe("public mode", () => {
  test("the demonstration is off, the evidence is shown, and the classifier endpoints refuse", async ({ page, request }) => {
    const calls: string[] = [];
    page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/") && calls.push(new URL(r.url()).pathname));
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await expect(page.getByText(/Public mode. The demonstration is switched off/)).toBeVisible();
    await expect(exampleRadios(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run the classifier" })).toHaveCount(0);
    await expect(page.getByLabel("Headline test results")).toContainText("0.386");
    expect(calls.filter((c) => c.includes("/classify/"))).toEqual([]);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/classify-public-desktop-light.png`, fullPage: true });
    }

    // Straight to the API: refused, with no model involved
    const examples = await request.get("/api/v1/classify/examples");
    expect(examples.status()).toBe(403);
    expect((await examples.json()).error.code).toBe("local_only");
    const predict = await request.post("/api/v1/classify/predict", { data: { example_id: "ex_782bfd92" } });
    expect(predict.status()).toBe(403);
    const meta = await (await request.get("/api/v1/meta")).json();
    expect(meta.features.classifier_demo).toBe(false);
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const [name, size] of Object.entries(SIZES)) {
      test(`axe: no WCAG A or AA problems, ${name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize(size);
        await open(page, scheme);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/classify-public-${name}-${scheme}.png`, fullPage: true });
      });
    }
  }
});
