import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// WCAG 2.2 AA checks that go beyond what axe can see: keyboard use, focus, target size, reflow, text spacing and motion.
const ROUTES = [
  ["/", "Profile Intelligence"],
  ["/discover", "Profile Discovery | Profile Intelligence"],
  ["/lab", "Research overview | Profile Intelligence"],
  ["/lab/segments", "Segments | Profile Intelligence"],
  ["/lab/models", "Model performance | Profile Intelligence"],
  ["/lab/similarity", "Profile similarity | Profile Intelligence"],
  ["/lab/fairness", "Fairness and limitations | Profile Intelligence"],
  ["/lab/classify", "Classification evidence | Profile Intelligence"],
  ["/about", "Data, ethics and limits | Profile Intelligence"],
] as const;

async function open(page: Page, path: string, size = { width: 1280, height: 800 }) {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize(size);
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => { await document.fonts.ready; }) // returns nothing: Firefox crashes serializing a FontFaceSet;
}

test.describe("structure that screen readers rely on", () => {
  test("every page has a unique title, one main landmark, a labelled navigation, a language and one h1", async ({ page }) => {
    const titles = new Set<string>();
    for (const [route, title] of ROUTES) {
      await open(page, route);
      await expect(page).toHaveTitle(title === "Profile Intelligence" ? /Profile Intelligence/ : title);
      titles.add(await page.title());
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
      expect(await page.locator("html").getAttribute("lang")).toBe("en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveCount(1);
    }
    expect(titles.size).toBe(ROUTES.length);
  });

  test("the accessibility tree of a chart page lists named figures, tables and a live readout", async ({ page }) => {
    await open(page, "/lab/models");
    const tree = await page.locator("main").ariaSnapshot();
    expect(tree).toMatch(/figure "Essay words plus lifestyle answers score best/);
    expect(tree).toMatch(/radiogroup|group "Models"/);
    expect(tree).toMatch(/button "Show as table"/);
    expect(tree).toMatch(/list "Macro F1 by model"/);
    expect(tree).not.toMatch(/img ""/); // no unnamed images
  });

  test("the current page is marked in the navigation, and a result announces itself politely", async ({ page }) => {
    await open(page, "/lab/similarity");
    await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Profile similarity" })).toHaveAttribute("aria-current", "page");
    await open(page, "/discover");
    await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in bookshops and drink too much tea.");
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    await expect(page.locator("[aria-live=polite]").first()).toBeAttached();
  });
});

test.describe("keyboard and focus (2.1.1, 2.1.2, 2.4.7, 2.4.11)", () => {
  for (const [name, size] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]] as const) {
    test(`tabbing through every page on ${name}: no trap, a visible ring, and focus is never hidden behind other content`, async ({ page, browserName }) => {
      test.skip(browserName === "webkit", "Safari tabs only to form controls unless its 'Press Tab to highlight each item' setting is on");
      for (const [route] of ROUTES) {
        await open(page, route, size);
        if (route === "/discover") {
          // Show the fixed comparison tray, the one element that sits over the page, then check focus is not hidden by it.
          await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in bookshops and drink too much tea.");
          await page.getByRole("button", { name: "Find similar profiles" }).click();
          await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
          await page.getByTestId("result-embeddings-1").getByRole("button", { name: /^Compare [A-Z]/ }).click();
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        // Start tabbing from the top of the page. A click would set the starting point differently in each browser, so
        // the caret is placed at the start of the document instead, which every engine uses as the starting point.
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          (document.activeElement as HTMLElement | null)?.blur();
          const range = document.createRange();
          range.setStart(document.body, 0);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        });
        const stops: string[] = [];
        const problems: string[] = [];
        for (let i = 0; i < 70; i++) {
          await page.keyboard.press("Tab");
          // Let the browser finish scrolling the newly focused control into view before measuring, as a person would see it.
          await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
          const info = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement;
            if (!el || el === document.body) return null;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
            const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
            const top = document.elementFromPoint(cx, cy);
            const covered = !!top && top !== el && !el.contains(top) && !top.contains(el);
            const ring = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) || style.boxShadow !== "none";
            const inside = el.closest("label")?.matches(":has(:focus-visible)") ?? false;
            return { id: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`, covered, by: top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)} at y=${Math.round(rect.top)}` : "nothing", ring: ring || inside, visible: rect.width > 0 && rect.height > 0 };
          });
          if (!info) break; // focus left the page: no trap
          stops.push(info.id);
          if (!info.visible) problems.push(`not visible: ${info.id}`);
          if (info.covered) problems.push(`covered by other content: ${info.id} (by ${info.by})`);
          if (!info.ring) problems.push(`no focus ring: ${info.id}`);
        }
        expect(problems, `${route} ${name}`).toEqual([]);
        expect(stops.length, `${route} ${name}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test("Escape closes every dialog and returns focus to the control that opened it", async ({ page }) => {
    await open(page, "/discover");
    await page.getByRole("textbox", { name: "Profile text" }).fill("I spend weekends in bookshops and drink too much tea.");
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    const view = page.getByTestId("result-embeddings-1").getByRole("button", { name: /^View profile/ });
    await view.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    // Focus stays inside the dialog while tabbing
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(view).toBeFocused();
  });
});

test.describe("target size, reflow, text spacing and motion (2.5.8, 1.4.10, 1.4.12, 2.3.3)", () => {
  test("every control is at least 24 by 24 pixels", async ({ page }) => {
    for (const [route] of ROUTES) {
      for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        await open(page, route, size);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("button, select, summary, [role=tab], input:not([type=radio]):not([type=checkbox]), textarea, label:has(input[type=radio])")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !el.closest("[hidden]");
            })
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width < 24 || r.height < 24)
            .map(({ el, r }) => `${el.tagName} ${(el.textContent ?? "").trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`),
        );
        expect(small, `${route} ${size.width}`).toEqual([]);
      }
    }
  });

  test("content reflows at 320 CSS pixels wide, and on a phone turned sideways, with no sideways scroll", async ({ page }) => {
    for (const [route] of ROUTES) {
      for (const size of [{ width: 320, height: 640 }, { width: 667, height: 375 }]) {
        await open(page, route, size);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${route} ${size.width}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test("with the WCAG text spacing applied, nothing is clipped, nothing scrolls sideways and axe is still clean", async ({ page }) => {
    for (const [route] of ROUTES) {
      await open(page, route, { width: 390, height: 844 });
      await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), route).toBeLessThanOrEqual(0);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => {
            const s = getComputedStyle(el);
            return (s.overflowY === "hidden" || s.overflow === "hidden") && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && !el.closest("svg") && el.getAttribute("aria-hidden") !== "true" && !el.className.toString().includes("sr-only");
          })
          .map((el) => `${el.tagName} ${el.className.toString().slice(0, 40)}`),
      );
      expect(clipped, route).toEqual([]);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => v.id), route).toEqual([]);
    }
  });

  test("with reduced motion requested, no animation is running on any page", async ({ page }) => {
    for (const [route] of ROUTES) {
      await open(page, route);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => (a.effect as KeyframeEffect | null)?.target?.className?.toString().slice(0, 30) ?? "?"));
      expect(running, route).toEqual([]);
    }
  });

  test("zoomed to 200%, a page is still usable: no sideways scroll, controls reachable", async ({ page }) => {
    await open(page, "/lab/models", { width: 640, height: 400 }); // 1280 by 800 at 200%
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
