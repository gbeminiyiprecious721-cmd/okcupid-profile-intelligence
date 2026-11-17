import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const PAGES = [
  ["home", "/"],
  ["discover", "/discover"],
  ["lab", "/lab"],
  ["segments", "/lab/segments"],
  ["models", "/lab/models"],
  ["similarity", "/lab/similarity"],
  ["fairness", "/lab/fairness"],
  ["classify", "/lab/classify"],
  ["about", "/about"],
] as const;

const SIZES = { desktop: { width: 1280, height: 800 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } };
const SHOTS = process.env.SHOT_DIR;

async function open(page: Page, path: string, scheme: "light" | "dark", reduced = true) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto(path);
  await expect(page.getByRole("status")).toContainText("Service online");
  await page.evaluate(async () => { await document.fonts.ready; }) // returns nothing: Firefox crashes serializing a FontFaceSet;
}

test.describe("public wording", () => {
  test("the home page links prominently to working Profile Discovery and makes no claim that no profiles exist", async ({ page }) => {
    await open(page, "/", "light");
    await expect(page.locator("main")).not.toContainText(/no profiles exist|early build|placeholder|layout sketch/i);
    const link = page.getByRole("main").getByRole("link", { name: "Try Profile Discovery" });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByRole("heading", { level: 1, name: "Profile Discovery" })).toBeVisible();
  });

  test("on a desktop screen the first view shows the headline, the gold action and the research figures", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop layout");
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/", "light");
    const inView = async (locator: ReturnType<Page["locator"]>) => {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    };
    await inView(page.getByRole("heading", { level: 1 }));
    await inView(page.getByRole("link", { name: "Try Profile Discovery" }));
    await inView(page.getByRole("link", { name: "About the Project" }));
    await expect(page.getByText("Profiles analysed")).toBeVisible();
    await inView(page.getByText("Profiles analysed"));
    await expect(page.getByText("Historical dataset")).toBeVisible();
  });

  test("the gold action, the figures and the feature cards work with the keyboard and show a focus ring", async ({ page }) => {
    await open(page, "/", "dark");
    await page.getByRole("link", { name: "Try Profile Discovery" }).focus();
    const outline = await page.getByRole("link", { name: "Try Profile Discovery" }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    const card = page.getByRole("link", { name: /^Responsible AI/ });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/lab\/fairness$/);
  });

  test("the classification page is called Classification evidence in the menu, heading and tab title", async ({ page, isMobile }) => {
    await open(page, "/lab/classify", "light");
    await expect(page).toHaveTitle("Classification evidence | Profile Intelligence");
    await expect(page.getByRole("heading", { level: 1, name: "Classification evidence" })).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    await expect(nav.getByRole("link", { name: "Classification evidence" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Classification demo" })).toHaveCount(0);
  });
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    for (const [name, path] of PAGES) {
      test(`axe finds no WCAG A or AA problems on ${name}`, async ({ page }) => {
        await page.setViewportSize(SIZES.desktop);
        await open(page, path, scheme);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });

      if (SHOTS) {
        for (const [size, viewport] of Object.entries(SIZES)) {
          test(`screenshot ${name} ${size} ${scheme}`, async ({ page }) => {
            mkdirSync(SHOTS, { recursive: true });
            await page.setViewportSize(viewport);
            await open(page, path, scheme);
            await page.screenshot({ path: `${SHOTS}/${name}-${size}-${scheme}.png`, fullPage: true });
          });
        }
      }
    }
  });
}

if (SHOTS) {
  test("screenshot of the open phone menu", async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(SIZES.mobile);
    await open(page, "/lab/models", "light");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/menu-mobile-light.png` });
    await page.getByRole("dialog").getByRole("button", { name: "Dark" }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${SHOTS}/menu-mobile-dark.png` });
  });
}

test("the page never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize(SIZES.mobile);
  for (const [, path] of PAGES) {
    await open(page, path, "light");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("the skip link comes first and every focused control shows a focus ring", async ({ page, browserName }) => {
  // Safari tabs only to form controls unless its "Press Tab to highlight each item" setting is on, so this checks Chrome and Firefox.
  test.skip(browserName === "webkit", "Safari does not tab to links by default");
  await page.setViewportSize(SIZES.desktop);
  await open(page, "/discover", "light");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  // Tab through the page. Every control that takes focus must show a visible ring.
  await page.locator("body").evaluate(() => (document.activeElement as HTMLElement).blur());
  let checked = 0;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const element = document.activeElement as Element;
      if (element === document.body) return null; // focus left the page
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), name: element.tagName };
    });
    if (!ring) continue;
    expect(ring.style, ring.name).toBe("solid");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    checked++;
  }
  expect(checked).toBeGreaterThanOrEqual(10);
});

test("the sidebar can be used by keyboard alone and focus lands on the new heading", async ({ page }) => {
  await page.setViewportSize(SIZES.desktop);
  await open(page, "/", "light");
  const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Fairness and limits" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Fairness and limitations" })).toBeFocused();
  await expect(page).toHaveTitle("Fairness and limitations | Profile Intelligence");
});

test("the phone menu opens, traps focus, closes with Escape and returns focus", async ({ page }) => {
  await page.setViewportSize(SIZES.mobile);
  await open(page, "/", "light");
  const button = page.getByRole("button", { name: "Open navigation" });
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});

test("the thread draws once normally and is fully drawn with reduced motion", async ({ page }) => {
  await page.setViewportSize(SIZES.desktop);
  await open(page, "/discover", "light", false);
  const name = () => page.locator("main svg path.thread-draw").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(await name()).toBe("thread-draw");
  await open(page, "/discover", "light", true);
  expect(await name()).toBe("none");
  const offset = await page.locator("main svg path.thread-draw").first().evaluate((el) => getComputedStyle(el).strokeDashoffset);
  expect(parseFloat(offset)).toBe(0);
});

test("the real backend answers through the proxy and the badge shows public mode", async ({ page, request }) => {
  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: "ok", mode: "public" });
  await open(page, "/lab/classify", "light");
  await expect(page.getByText("Public mode").first()).toBeVisible();
  await expect(page.getByText(/The demonstration is switched off/)).toBeVisible();
});

test("the theme choice persists after a reload", async ({ page }) => {
  await open(page, "/", "light");
  // On a phone the colour theme buttons are in the navigation drawer, not in the top bar.
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("group", { name: "Colour theme" }).getByRole("button", { name: "Dark" }).last().click();
  if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
