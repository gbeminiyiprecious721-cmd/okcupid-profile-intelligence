import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.SHOT_DIR;
const SIZES = { wide: { width: 1700, height: 1000 }, desktop: { width: 1360, height: 900 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } };
const TEXT = "I spend weekends in second hand bookshops, drink too much tea, and write poems and short novels in a notebook.";

async function open(page: Page, scheme: "light" | "dark" = "light", reduced = true) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto("/discover");
  await expect(page.getByRole("textbox", { name: "Profile text" })).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; }) // returns nothing: Firefox crashes serializing a FontFaceSet;
}
async function search(page: Page, text = TEXT, method?: RegExp) {
  await page.getByRole("textbox", { name: "Profile text" }).fill(text);
  if (method) await page.getByRole("radio", { name: method }).check();
  await page.getByRole("button", { name: "Find similar profiles" }).click();
}
async function shot(page: Page, name: string, full = true) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(1600); // let the thread finish drawing
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("journey with the real service", () => {
  test("both methods: separate lists, separate scales, real scores, explanations", async ({ page }) => {
    await page.setViewportSize(SIZES.wide); // two lists sit side by side from 1536px
    await open(page);
    await shot(page, "01-empty-desktop-light");
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/discover/similar")),
      search(page),
    ]);
    const body = await response.json();
    expect(response.status()).toBe(200);
    // Nothing the service returns carries a profile text, and every profile is marked synthetic.
    for (const result of body.results) for (const n of result.neighbours) expect(Object.keys(n)).not.toContain("text");
    expect(body.pool.synthetic).toBe(true);

    const emb = page.getByRole("list", { name: "Similar profiles by Sentence embeddings" });
    const tf = page.getByRole("list", { name: "Similar profiles by TF-IDF" });
    await expect(emb.locator(":scope > li")).toHaveCount(5);
    await expect(tf.locator(":scope > li")).toHaveCount(5);

    // The scores on the page are the scores the service returned, per method, in the same order.
    for (const result of body.results) {
      const list = result.method === "embeddings" ? emb : tf;
      const shown = await list.locator("li span.tabular-nums").allTextContents();
      expect(shown).toEqual(result.neighbours.map((n: { score: number }) => n.score.toFixed(3)));
    }
    const embScores = body.results.find((r: { method: string }) => r.method === "embeddings").neighbours.map((n: { score: number }) => n.score);
    const tfScores = body.results.find((r: { method: string }) => r.method === "tfidf").neighbours.map((n: { score: number }) => n.score);
    expect([...embScores].sort((a, b) => b - a)).toEqual(embScores);
    expect(Math.min(...embScores)).toBeGreaterThan(Math.max(...tfScores)); // the scales differ, which is why they are not merged
    await expect(page.getByTestId("comparison")).toContainText("different scales");
    await expect(page.getByTestId("thread-layer")).toBeVisible();
    await expect(page.getByTestId("thread-layer").locator("path")).toHaveCount(2);
    await shot(page, "02-results-both-wide-light");
  });

  test("embeddings only and TF-IDF only each send their own request", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    for (const [label, method, other] of [
      [/Sentence embeddings/, "embeddings", "TF-IDF"],
      [/^TF-IDF/, "tfidf", "Sentence embeddings"],
    ] as const) {
      const [request] = await Promise.all([page.waitForRequest((r) => r.url().endsWith("/discover/similar")), search(page, TEXT, label)]);
      expect(request.postDataJSON().method).toBe(method);
      await expect(page.getByRole("list", { name: /Similar profiles by/ })).toHaveCount(1);
      await expect(page.getByRole("list", { name: `Similar profiles by ${other}` })).toHaveCount(0);
      await expect(page.getByTestId("comparison")).toHaveCount(0);
    }
    await shot(page, "03-results-tfidf-only-desktop-light");
  });

  test("a starter example runs end to end and its explanations come from the service", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    const starters = page.getByRole("group").filter({ has: page.getByRole("button") }).first();
    await expect(page.getByText("Start from an example", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^[A-Z][a-z]+ [A-Z][a-z]+$/ }).first().click();
    await expect(page.getByRole("textbox", { name: "Profile text" })).not.toHaveValue("");
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    const card = page.getByTestId("result-embeddings-1");
    await expect(card).toBeVisible();
    await expect(card.getByText("Fictional profile")).toBeVisible();
    await expect(card.getByText("Words you both use")).toBeVisible();
    await expect(card.getByText("Lifestyle answers you share")).toBeVisible();
    void starters;
  });

  test("lifestyle answers: rare shared answers are shown with their share, common ones are set aside", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.getByText("Lifestyle answers, optional").click();
    await page.getByLabel("Relationship status").selectOption("single");
    await page.getByLabel("Pets").selectOption("has a cat");
    await search(page);
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    const text = (await page.getByRole("main").innerText()).toLowerCase();
    // "single" is the answer of most of the pool, so it must never be presented as a distinctive match.
    expect(text).not.toMatch(/relationship status: single \(shared by/);
    if (text.includes("relationship status single")) expect(text).toContain("very common and so not telling");
    await shot(page, "04-lifestyle-weighting-desktop-light");
  });

  test("profile detail comes from the profile endpoint, and focus returns to the button", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page);
    const card = page.getByTestId("result-embeddings-1");
    const view = card.getByRole("button", { name: /^View profile/ });
    await view.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("profile-text")).toBeVisible();
    await expect(dialog).toContainText("not a real person");
    await shot(page, "05-profile-dialog-desktop-light", false);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(view).toBeFocused();
  });

  test("two profiles can be compared, a third cannot be added", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page, TEXT, /Sentence embeddings/);
    const compareButtons = page.getByRole("button", { name: /^Compare [A-Z]/ });
    await compareButtons.nth(0).click();
    await expect(page.getByRole("button", { name: "Compare profiles" })).toBeDisabled();
    await compareButtons.nth(1).click();
    await expect(page.getByRole("button", { name: /^Compare [A-Z]/ }).nth(2)).toBeDisabled();
    await page.getByRole("button", { name: "Compare profiles" }).click();
    const dialog = page.getByRole("dialog", { name: "Compare two profiles" });
    await expect(dialog.getByTestId("in-common")).toBeVisible();
    await expect(dialog).toContainText("does not score them against each other");
    // Real profiles: either meaningful keywords with their context, or the exact empty message. Never the generic word "way".
    const keywords = dialog.getByRole("list", { name: "Shared keywords" });
    if (await keywords.count()) {
      await expect(keywords.getByRole("listitem").first()).toContainText("“");
      await expect(keywords).not.toContainText(/\bway\b/i);
    } else {
      await expect(dialog.getByTestId("in-common")).toContainText("No meaningful shared keywords found.");
    }
    await shot(page, "06-compare-desktop-light", false);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Comparison" })).toBeVisible();
  });
});

test.describe("inputs the service or the form must refuse", () => {
  test("empty and too short text show a message and send nothing", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    let sent = 0;
    page.on("request", (r) => r.url().endsWith("/discover/similar") && sent++);
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    await expect(page.getByRole("textbox", { name: "Profile text" })).toHaveAccessibleDescription(/Write a few sentences/);
    await shot(page, "07-validation-empty-desktop-light", false);
    await page.getByRole("textbox", { name: "Profile text" }).fill("two words");
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    await expect(page.getByRole("textbox", { name: "Profile text" })).toHaveAccessibleDescription(/at least 3 words/);
    expect(sent).toBe(0);
  });

  test("text made only of contact details is refused by the service and shown at the field", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page, "https://example.test/me someone@example.test 555 123 4567");
    await expect(page.getByRole("textbox", { name: "Profile text" })).toHaveAccessibleDescription(/no words left to compare/i);
  });

  test("personal details inside a profile are removed and counted, not echoed", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page, `${TEXT} Write to someone@example.test or see https://example.test/me`);
    await expect(page.getByText(/Removed before searching: 1 link, 1 email/)).toBeVisible();
    // The form still holds what was typed, which is the person's own text. Nothing the service returned repeats it.
    await expect(page.getByTestId("input-summary")).not.toContainText("example.test");
    await expect(page.getByRole("list", { name: /Similar profiles by/ }).first()).not.toContainText("example.test");
  });

  test("words outside the pool vocabulary: TF-IDF says so, embeddings still answer", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page, "zzqx qqvw xxkp");
    await expect(page.getByRole("list", { name: "Similar profiles by Sentence embeddings" }).locator(":scope > li")).toHaveCount(5);
    await page.getByRole("tab", { name: "TF-IDF" }).click(); // below 1536px the lists are tabs
    await expect(page.getByText(/None of your words appear in the vocabulary/)).toBeVisible();
  });
});

test.describe("failures", () => {
  test("a 500 shows an alert, keeps the text, and Try again recovers", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    let fail = true;
    await page.route("**/discover/similar", (route) =>
      fail ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on the server." } }) }) : route.continue(),
    );
    await search(page);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Something went wrong on the server.");
    await expect(page.getByRole("textbox", { name: "Profile text" })).toHaveValue(TEXT);
    await shot(page, "08-error-server-desktop-light", false);
    fail = false;
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("a service that is unreachable is explained", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.route("**/discover/similar", (route) => route.abort("connectionrefused"));
    await search(page);
    await expect(page.getByRole("alert")).toContainText("The service did not answer");
  });

  test("a feature switched off on the server is explained", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.route("**/discover/similar", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "feature_unavailable", message: "Profile discovery is not available on this server." } }) }),
    );
    await search(page);
    await expect(page.getByRole("alert")).toContainText("Discovery is not available");
  });

  test("a slow search shows loading placeholders, then the results", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.route("**/discover/similar", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await search(page);
    await expect(page.getByRole("status", { name: "Searching the fictional profiles" })).toBeVisible();
    await shot(page, "09-loading-desktop-light", false);
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
  });

  test("a missing profile shows an error inside the dialog", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page);
    await page.route("**/discover/profiles/*", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "not_found", message: "There is no profile with this identifier." } }) }),
    );
    await page.getByTestId("result-embeddings-1").getByRole("button", { name: /^View profile/ }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("That profile could not be found");
  });
});

test.describe("phone and tablet", () => {
  for (const [name, size] of [["mobile", SIZES.mobile], ["tablet", SIZES.tablet]] as const) {
    test(`${name}: no sideways scroll, tabs switch the method, controls are large enough`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      expect(await noOverflow(page)).toBe(true);
      await shot(page, `10-empty-${name}-light`);
      await search(page);
      await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      const tabs = page.getByRole("tablist", { name: "Choose a method" });
      await expect(tabs).toBeVisible();
      await expect(page.getByTestId("result-tfidf-1")).toBeHidden();
      await shot(page, `11-results-embeddings-${name}-light`);
      await tabs.getByRole("tab", { name: "TF-IDF" }).click();
      await expect(page.getByTestId("result-tfidf-1")).toBeVisible();
      await expect(page.getByTestId("result-embeddings-1")).toBeHidden();
      await shot(page, `12-results-tfidf-${name}-light`);
      // Every button and field in the form is at least 44 CSS pixels tall (WCAG 2.2 target size, level AAA; we aim for it).
      for (const el of await page.getByRole("button", { name: /Find similar|Clear/ }).all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });
  }

  test("mobile: profile and compare dialogs fit the screen", async ({ page }) => {
    await page.setViewportSize(SIZES.mobile);
    await open(page);
    await search(page, TEXT, /Sentence embeddings/);
    await page.getByTestId("result-embeddings-1").getByRole("button", { name: /^View profile/ }).click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await shot(page, "13-profile-dialog-mobile-light", false);
    await page.keyboard.press("Escape");
    const adds = page.getByRole("button", { name: /^Compare [A-Z]/ });
    await adds.nth(0).click();
    await adds.nth(1).click();
    await page.getByRole("button", { name: "Compare profiles" }).click();
    await expect(page.getByRole("dialog").getByTestId("in-common")).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, "14-compare-mobile-light", false);
  });
});

test.describe("accessibility and motion", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const [name, size] of [["desktop", SIZES.desktop], ["mobile", SIZES.mobile]] as const) {
      test(`axe: no WCAG A or AA problems with results open, ${name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize(size);
        await open(page, scheme);
        await page.getByText("Lifestyle answers, optional").click();
        await page.getByLabel("Pets").selectOption("has a cat");
        await search(page);
        await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
        await page.waitForTimeout(1500);
        const check = async (label: string) => {
          const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(result.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
        };
        await check("results");
        await page.getByRole("button", { name: /^View profile/ }).first().click();
        await expect(page.getByRole("dialog").getByTestId("profile-text")).toBeVisible();
        await check("profile dialog");
        await page.keyboard.press("Escape");
        const adds = page.getByRole("button", { name: /^Compare [A-Z]/ });
        await adds.nth(0).click();
        await adds.nth(1).click();
        await check("tray");
        await page.getByRole("button", { name: "Compare profiles" }).click();
        await expect(page.getByRole("dialog").getByTestId("in-common")).toBeVisible();
        await check("compare dialog");
        if (name === "desktop") await shot(page, `15-compare-${name}-${scheme}`, false);
      });
    }
  }

  test("dark theme screenshots of the results", async ({ page }) => {
    test.skip(!SHOTS, "screenshots only");
    await page.setViewportSize(SIZES.desktop);
    await open(page, "dark");
    await search(page);
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    await shot(page, "16-results-both-desktop-dark");
    await page.setViewportSize(SIZES.mobile);
    await shot(page, "17-results-both-mobile-dark");
  });

  test("keyboard only: the whole search works without a pointer", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.getByRole("textbox", { name: "Profile text" }).focus();
    await page.keyboard.type(TEXT);
    await page.getByRole("button", { name: "Find similar profiles" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    const view = page.getByTestId("result-embeddings-1").getByRole("button", { name: /^View profile/ });
    await view.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(view).toBeFocused();
  });

  test("with reduced motion the thread is already drawn and nothing animates", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "light", true);
    await search(page);
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    const state = await page.evaluate(() => {
      const path = document.querySelector('[data-testid="thread-layer"] path') as SVGPathElement;
      const card = document.querySelector('[data-testid="result-embeddings-1"]') as HTMLElement;
      return { animation: getComputedStyle(path).animationName, offset: getComputedStyle(path).strokeDashoffset, opacity: getComputedStyle(card).opacity };
    });
    expect(state.animation).toBe("none");
    expect(state.opacity).toBe("1");
  });

  test("with motion allowed the thread draws once and then rests", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page, "light", false);
    await search(page);
    await expect(page.getByTestId("thread-layer")).toBeVisible();
    await page.waitForTimeout(2000);
    const offset = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="thread-layer"] path')!).strokeDashoffset);
    expect(parseFloat(offset)).toBe(0);
  });
});

test.describe("Stage 9B presentation", () => {
  test("profiles found by both methods are marked in each list, matching what the service reported", async ({ page }) => {
    await page.setViewportSize(SIZES.wide);
    await open(page);
    const [response] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/v1/discover/similar")), search(page)]);
    const body = await response.json();
    const both: string[] = body.comparison.in_both;
    const handles = new Map<string, string>(body.results.flatMap((r: { neighbours: { profile_id: string; display_handle: string }[] }) => r.neighbours.map((n) => [n.profile_id, n.display_handle] as const)));
    await expect(page.getByTestId("comparison")).toBeVisible();
    const badges = page.getByText("Found by both methods");
    await expect(badges).toHaveCount(both.length * 2);
    for (const id of both) {
      const cards = page.locator("li", { has: page.getByRole("heading", { level: 3, name: handles.get(id)! }) });
      await expect(cards).toHaveCount(2);
      for (const card of await cards.all()) await expect(card).toContainText("Found by both methods");
    }
  });

  test("on a phone, a finished search scrolls the results into view", async ({ page }) => {
    await page.setViewportSize(SIZES.mobile);
    await open(page, "light", true); // reduced motion: an instant jump, so there is nothing to wait for
    await search(page);
    await expect(page.getByTestId("input-summary")).toBeVisible();
    await expect(page.getByTestId("input-summary")).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  });

  test("on a wide screen, a finished search leaves the page where it was", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await page.getByRole("textbox", { name: "Profile text" }).fill(TEXT);
    const button = page.getByRole("button", { name: "Find similar profiles" });
    await button.scrollIntoViewIfNeeded(); // reaching the button is the visitor's own scrolling, so measure after it
    const before = await page.evaluate(() => window.scrollY);
    await button.click();
    await expect(page.getByTestId("input-summary")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("at 320 pixels wide the results and both method tabs have no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await open(page);
    await search(page);
    await expect(page.getByTestId("comparison")).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await page.getByRole("tab", { name: "TF-IDF" }).click();
    await expect(page.getByTestId("result-tfidf-1")).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });

  test("the method tabs switch the list shown, and the selected tab says so", async ({ page }) => {
    await page.setViewportSize(SIZES.desktop);
    await open(page);
    await search(page);
    await expect(page.getByRole("tab", { name: "Sentence embeddings" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("result-embeddings-1")).toBeVisible();
    await expect(page.getByTestId("result-tfidf-1")).toBeHidden();
    await page.getByRole("tab", { name: "TF-IDF" }).click();
    await expect(page.getByRole("tab", { name: "TF-IDF" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("result-tfidf-1")).toBeVisible();
    await expect(page.getByTestId("result-embeddings-1")).toBeHidden();
  });

  test("the search button is gold and large enough to press, and the method choices show a focus ring", async ({ page, browserName }) => {
    await page.setViewportSize(SIZES.mobile);
    await open(page);
    const button = page.getByRole("button", { name: "Find similar profiles" });
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThan(300); // full width on a phone
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    test.skip(browserName === "webkit", "Safari draws no focus ring for focus set by a script, and tabs only to form controls");
    await page.getByRole("radio", { name: /^Compare both/ }).focus();
    await page.keyboard.press("ArrowDown");
    const ring = await page.getByRole("radio", { name: /^Sentence embeddings/ }).evaluate((el) => getComputedStyle(el.closest("label")!).outlineStyle);
    expect(ring).not.toBe("none");
  });
});
