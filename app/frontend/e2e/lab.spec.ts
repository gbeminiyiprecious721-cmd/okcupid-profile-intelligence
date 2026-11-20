import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.SHOT_DIR;
const SIZES = { desktop: { width: 1360, height: 900 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } };
const PAGES = [
  ["overview", "/lab", "Research overview"],
  ["segments", "/lab/segments", "Segments"],
  ["models", "/lab/models", "Model performance"],
  ["similarity", "/lab/similarity", "Profile similarity"],
  ["fairness", "/lab/fairness", "Fairness and limitations"],
] as const;

async function open(page: Page, path: string, scheme: "light" | "dark" = "light") {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(path);
  await page.locator("figure, [role=alert]").first().waitFor(); // not .or(): that crashes Firefox about half the time
  await page.evaluate(async () => { await document.fonts.ready; }) // returns nothing: Firefox crashes serializing a FontFaceSet;
}
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
const choose = (scope: ReturnType<Page["locator"]>, name: string) => scope.locator("label").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).click();
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
const violations = (r: Awaited<ReturnType<typeof axe>>, label: string) => r.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);

test.describe("the five Lab pages load real findings", () => {
  for (const [name, path, title] of PAGES) {
    test(`${name}: heading, data from the service, screenshots`, async ({ page }) => {
      await page.setViewportSize(SIZES.desktop);
      await open(page, path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("note").first()).toBeVisible();
      for (const [size, viewport] of Object.entries(SIZES)) {
        await page.setViewportSize(viewport);
        expect(await noOverflow(page), `${name} ${size}`).toBe(true);
        await shot(page, `${name}-${size}-light`);
      }
      await page.setViewportSize(SIZES.desktop);
      await open(page, path, "dark");
      await shot(page, `${name}-desktop-dark`);
      await page.setViewportSize(SIZES.mobile);
      await shot(page, `${name}-mobile-dark`);
    });
  }

  test("the page asks only for aggregate endpoints and the summary holds no record level data", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/") && urls.push(new URL(r.url()).pathname));
    let body = "";
    page.on("response", async (r) => {
      if (r.url().endsWith("/api/v1/lab/summary")) body = await r.text();
    });
    await page.setViewportSize(SIZES.desktop);
    for (const [, path] of PAGES) await open(page, path);
    await page.getByRole("button", { name: /Notebook figure/ }).first().isVisible().catch(() => undefined);
    expect(urls.filter((u) => !/^\/api\/v1\/(health|meta|lab\/summary|lab\/figures\/[a-z_]+)$/.test(u))).toEqual([]);
    expect(body.length).toBeGreaterThan(5000);
    expect(body.length).toBeLessThan(60000);
    expect(body).not.toMatch(/essay\d|"text"|@\w+\.\w+|https?:\/\//);
  });

  test("the notebook figure loads", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/segments");
    await page.getByText("Notebook figure: every k").click();
    const img = page.getByRole("img", { name: /Two charts from the notebook/ });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await shot(page, "segments-figure-open-desktop-light");
  });
});

test.describe("interactions", () => {
  test("models: filter, training scores, readout and table view", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/models");
    const chart = page.getByRole("figure", { name: /Essay words plus lifestyle answers score best/ });
    const rows = chart.getByRole("list", { name: "Macro F1 by model" }).getByRole("button");
    await expect(rows).toHaveCount(11);
    await choose(chart, "With training");
    await expect(rows).toHaveCount(22);
    await rows.nth(0).click();
    await expect(chart.getByText(/Validation macro F1 0.387/)).toBeVisible();
    await choose(chart, "Logistic regression");
    await expect(rows).toHaveCount(18); // eight logistic models and the baseline, each with a training bar
    await shot(page, "models-filtered-desktop-light");
    await chart.getByRole("button", { name: "Show as table" }).click();
    await expect(chart.getByRole("table")).toBeVisible();
    await expect(chart.getByRole("columnheader", { name: "Training macro F1" })).toBeVisible();
  });

  test("models: hovering a confusion matrix cell explains it", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/models");
    const chart = page.getByRole("figure", { name: /Mistakes mostly go to the neighbouring group/ });
    await chart.getByRole("button", { name: /often\+ were predicted socially/ }).hover();
    await expect(chart.getByText(/34% of users who truly are "often\+" were predicted "socially"/)).toBeVisible();
  });

  test("segments: choosing a segment changes the description", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/segments");
    await page.getByRole("button", { name: /Segment 5, culture and nightlife/ }).click();
    await expect(page.getByTestId("segment-card")).toContainText("culture and nightlife");
    await expect(page.getByTestId("segment-card")).toContainText("Words that stand out");
    await shot(page, "segments-segment5-desktop-light");
  });

  test("similarity: method and view filters, with the table matching the chart", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/similarity");
    const chart = page.getByRole("figure", { name: /Neighbours agree a little more often than chance/ });
    await choose(chart, "Embeddings");
    await choose(chart, "Agreement");
    const first = chart.getByRole("list", { name: /by lifestyle field/ }).getByRole("button").first();
    await expect(first).toContainText("12.6%");
    await chart.getByRole("button", { name: "Show as table" }).click();
    await expect(chart.getByRole("row", { name: /Work 8.2% 12.6% 12.6%/ })).toBeVisible();
  });

  test("fairness: the four called out groups and the group filter", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/fairness");
    const cards = page.getByRole("list", { name: "Four groups called out" });
    await expect(cards).toContainText("0.393");
    await expect(cards).toContainText("0.327");
    await expect(cards).toContainText("0.275");
    const chart = page.getByRole("figure", { name: /Performance is fairly even/ });
    await choose(chart, "Age");
    await expect(chart.getByRole("list", { name: "Macro F1 by age" }).getByRole("button")).toHaveCount(5);
    await shot(page, "fairness-age-desktop-light");
  });

  test("keyboard only: tab to a filter, change it with arrow keys, press a bar", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/models");
    const chart = page.getByRole("figure", { name: /Essay words plus lifestyle answers score best/ });
    await chart.getByRole("radio", { name: "All" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(chart.getByRole("radio", { name: "Logistic regression" })).toBeChecked();
    await chart.getByRole("list", { name: "Macro F1 by model" }).getByRole("button").first().focus();
    await expect(chart.getByText(/Validation macro F1/)).toBeVisible();
  });

  test("phone: charts stay readable and the table view needs no sideways page scroll", async ({ page }) => {
    await page.setViewportSize(SIZES.mobile);
    await open(page, "/lab/models");
    const chart = page.getByRole("figure", { name: /Essay words plus lifestyle answers score best/ });
    await chart.getByRole("button", { name: "Show as table" }).click();
    expect(await noOverflow(page)).toBe(true);
    const bar = (await chart.getByRole("button", { name: "Show chart" }).boundingBox())!;
    expect(bar.height).toBeGreaterThanOrEqual(44);
    await shot(page, "models-table-mobile-light");
  });
});

test.describe("accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const [sizeName, size] of [["desktop", SIZES.desktop], ["mobile", SIZES.mobile]] as const) {
      for (const [name, path] of PAGES) {
        test(`axe: no WCAG A or AA problems on ${name}, ${sizeName} ${scheme}`, async ({ page }) => {
          await page.setViewportSize(size);
          await open(page, path, scheme);
          const found = violations(await axe(page), "page");
          // Again with every chart switched to its table and every chart readout open.
          const toggles = page.getByRole("button", { name: "Show as table" });
          while (await toggles.count()) await toggles.first().click();
          found.push(...violations(await axe(page), "tables"));
          expect(found).toEqual([]);
        });
      }
    }
  }

  test("axe: segment card, notebook figure and confusion matrix focus states", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "/lab/segments");
    await page.getByRole("button", { name: /Segment 6, older professionals/ }).click();
    await page.getByText("Notebook figure: every k").click();
    expect(violations(await axe(page), "segments")).toEqual([]);
    await open(page, "/lab/models", "dark");
    await page.getByRole("button", { name: /often\+ were predicted socially/ }).focus();
    expect(violations(await axe(page), "confusion")).toEqual([]);
  });
});

test.describe("Stage 9C: the refined Lab pages", () => {
  const SIX = [...PAGES, ["classify", "/lab/classify", "Classification evidence"]] as const;

  for (const [name, path, title] of SIX) {
    test(`${name}: at 320 pixels the summary, the cards and the charts fit with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await open(page, path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("region", { name: "In short" })).toBeVisible();
      expect(await noOverflow(page), `${name} at 320`).toBe(true);
      // every chart container must also fit inside the screen
      const widest = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll("figure")].map((f) => f.getBoundingClientRect().right)));
      expect(widest).toBeLessThanOrEqual(320);
    });
  }

  for (const [name, path] of PAGES) {
    test(`${name}: on a desktop screen the title and the In short summary are in the first view`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, path);
      const summary = page.getByRole("region", { name: "In short" });
      await expect(summary).toBeVisible();
      const box = await summary.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    });
  }

  test("a chart can be read as a table and back with the keyboard, and the switch shows its state", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Safari tabs only to form controls unless its Tab setting is on");
    await open(page, "/lab/models");
    const chart = page.getByRole("figure").first();
    const toggle = chart.getByRole("button", { name: "Show as table" });
    await toggle.focus();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Enter");
    await expect(chart.getByRole("table")).toBeVisible();
    await expect(chart.getByRole("button", { name: "Show chart" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(chart.getByRole("table")).toHaveCount(0);
  });

  test("the research figures are the same on every page that quotes them", async ({ page }) => {
    await open(page, "/lab");
    const overview = await page.getByRole("region", { name: "In short" }).innerText();
    expect(overview).toContain("0.386");
    expect(overview).toContain("0.212");
    await open(page, "/lab/models");
    const models = await page.getByRole("region", { name: "In short" }).innerText();
    expect(models).toContain("0.386");
    expect(models).toContain("0.212");
    expect(models).toContain("Adding segments did not improve validation macro F1.");
  });
});
