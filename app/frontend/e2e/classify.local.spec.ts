import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Runs against a local mode backend with the exported classifier (see playwright.local.config.ts).
const SHOTS = process.env.SHOT_DIR;
const SIZES = { desktop: { width: 1360, height: 900 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } };
const LEVELS = ["not at all", "rarely", "socially", "often+"];

async function open(page: Page, scheme: "light" | "dark" = "light") {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto("/lab/classify");
  await expect(page.getByRole("group", { name: /Choose one of six fictional examples/ })).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; }) // returns nothing: Firefox crashes serializing a FontFaceSet;
}
const exampleRadios = (page: Page) => page.locator("input[name=example]");
async function run(page: Page, index: number) {
  await exampleRadios(page).nth(index).check();
  const [response] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/classify/predict")), page.getByRole("button", { name: "Run the classifier" }).click()]);
  await expect(page.getByTestId("prediction")).toBeVisible();
  return response;
}
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.describe("local mode with the real classifier", () => {
  test("local mode keeps the Classification demo name", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await expect(page).toHaveTitle("Classification demonstration | Profile Intelligence");
    await expect(page.getByRole("heading", { level: 1, name: "Classification demonstration" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: "Classification demo" })).toBeVisible();
  });

  test("six examples, no free input, and every example gives valid probabilities", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await expect(exampleRadios(page)).toHaveCount(6);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run the classifier" })).toBeDisabled();
    await shot(page, "classify-local-start-desktop-light");

    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const response = await run(page, i);
      const body = await response.json();
      expect(response.request().postDataJSON()).toEqual({ example_id: body.example_id }); // nothing else is sent
      expect(body.classes.map((c: { level: string }) => c.level)).toEqual(LEVELS);
      const total = body.classes.reduce((n: number, c: { probability: number }) => n + c.probability, 0);
      expect(total).toBeCloseTo(1, 9);
      for (const c of body.classes) {
        expect(c.probability).toBeGreaterThanOrEqual(0);
        expect(c.probability).toBeLessThanOrEqual(1);
      }
      const top = body.classes.find((c: { is_predicted: boolean }) => c.is_predicted);
      expect(top.probability).toBe(Math.max(...body.classes.map((c: { probability: number }) => c.probability)));
      await expect(page.getByTestId("predicted")).toContainText(`Most probable category: ${body.predicted}`);
      for (const c of body.classes) {
        await expect(page.getByTestId(`prob-${c.level}`)).toContainText(`${(c.probability * 100).toFixed(1)}%`);
        await expect(page.getByTestId(`prob-${c.level}`)).toContainText(`base rate ${c.base_rate.toFixed(1)}%`);
      }
      seen.add(body.predicted);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  test("the same example gives the same answer every time", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    const first = await (await run(page, 2)).json();
    const second = await (await run(page, 2)).json();
    expect(second).toEqual(first);
    await shot(page, "classify-local-result-desktop-light");
  });

  test("the response carries no text and the request carries no input", async ({ page, request }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    const body = await (await run(page, 0)).text();
    expect(body).not.toMatch(/essay|text|@/i);
    const bad = await request.post("http://127.0.0.1:8001/api/v1/classify/predict", { data: { example_id: "ex_782bfd92", sex: "f", text: "anything" } });
    expect(bad.status()).toBe(422);
    expect(await bad.text()).not.toContain("anything");
    const free = await request.post("http://127.0.0.1:8001/api/v1/classify/predict", { data: { text: "hello" } });
    expect(free.status()).toBe(422);
  });

  test("stores nothing in the browser", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await run(page, 1);
    const stored = await page.evaluate(() => ({ local: Object.keys(localStorage).filter((k) => k !== "pi-theme"), session: Object.keys(sessionStorage), cookie: document.cookie }));
    expect(stored).toEqual({ local: [], session: [], cookie: "" });
  });

  test("keyboard only: choose an example with the arrow keys and run it", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await exampleRadios(page).first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(exampleRadios(page).nth(1)).toBeChecked();
    await page.keyboard.press("Tab"); // out of the radio group, to the first fictional text summary
    await page.getByRole("button", { name: "Run the classifier" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("prediction")).toBeVisible();
  });

  test("a failed run is explained", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.route("**/classify/predict", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on the server." } }) }));
    await exampleRadios(page).first().check();
    await page.getByRole("button", { name: "Run the classifier" }).click();
    await expect(page.getByRole("alert")).toContainText("Something went wrong on the server.");
  });

  for (const [name, size] of Object.entries(SIZES)) {
    test(`responsive: ${name} has no sideways scroll and large enough controls`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      await run(page, 3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const button = (await page.getByRole("button", { name: "Run the classifier" }).boundingBox())!;
      expect(button.height).toBeGreaterThanOrEqual(44);
      await shot(page, `classify-local-result-${name}-light`);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    for (const [name, size] of [["desktop", SIZES.desktop], ["mobile", SIZES.mobile]] as const) {
      test(`axe: no WCAG A or AA problems with a result showing, ${name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize(size);
        await open(page, scheme);
        await page.getByText("Read the fictional profile text").first().click();
        await run(page, 4);
        const found: string[] = [];
        const scan = async (label: string) => {
          const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          found.push(...result.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`));
        };
        await scan("result");
        const toggles = page.getByRole("button", { name: "Show as table" });
        while (await toggles.count()) await toggles.first().click();
        await scan("tables");
        expect(found).toEqual([]);
        await shot(page, `classify-local-result-${name}-${scheme}-full`);
      });
    }
  }
});
