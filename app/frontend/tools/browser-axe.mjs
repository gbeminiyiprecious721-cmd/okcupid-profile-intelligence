// WCAG 2.2 A and AA with axe, in one browser, every page, light and dark, desktop and phone.
// A standalone runner, not part of the Playwright test runner: Playwright's Firefox automation sometimes crashes a page
// ("Page crashed") inside the test runner, even though the same page passes axe when it is run directly. Here each check
// gets a fresh browser context, and a crash (not a violation) is retried up to three times. Violations are never retried.
//
//   node tools/browser-axe.mjs [firefox|chromium|webkit] [baseURL]
import { chromium, firefox, webkit } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const engine = { firefox, chromium, webkit }[process.argv[2] ?? "firefox"];
const base = process.argv[3] ?? "http://127.0.0.1:8080";
const PAGES = ["/", "/discover", "/lab", "/lab/segments", "/lab/models", "/lab/similarity", "/lab/fairness", "/lab/classify", "/about"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SIZES = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

const browser = await engine.launch();
let checks = 0, violations = 0, crashes = 0;
const problems = [];
for (const path of PAGES) {
  for (const scheme of ["light", "dark"]) {
    for (const [size, viewport] of Object.entries(SIZES)) {
      for (const tables of [false, true]) {
        if (tables && !path.startsWith("/lab")) continue;
        let done = false;
        for (let attempt = 1; attempt <= 3 && !done; attempt++) {
          const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
          const page = await context.newPage();
          try {
            await page.goto(base + path);
            await page.getByRole("main").waitFor();
            await page.waitForTimeout(600);
            if (tables) { const t = page.getByRole("button", { name: "Show as table" }); while (await t.count()) await t.first().click(); }
            const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
            checks++;
            if (result.violations.length) { violations += result.violations.length; problems.push(`${path} ${scheme} ${size}${tables ? " tables" : ""}: ${result.violations.map((v) => v.id).join(", ")}`); }
            done = true;
          } catch (error) {
            if (/crash/i.test(String(error.message))) { crashes++; } else { problems.push(`${path} ${scheme} ${size}: ${String(error.message).split("\n")[0]}`); done = true; }
          } finally { await context.close(); }
        }
        if (!done) problems.push(`${path} ${scheme} ${size}${tables ? " tables" : ""}: the browser crashed three times`);
      }
    }
  }
}
// Discovery with results, the profile dialog and the comparison dialog open: the states the loops above do not reach.
const TEXT = "I spend weekends in second hand bookshops, drink too much tea, and write poems and short novels in a notebook.";
for (const scheme of ["light", "dark"]) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
      const page = await context.newPage();
      const label = `/discover ${scheme} ${size}`;
      try {
        await page.goto(base + "/discover");
        await page.getByRole("textbox", { name: "Profile text" }).fill(TEXT);
        await page.getByRole("button", { name: "Find similar profiles" }).click();
        await page.getByTestId("result-embeddings-1").waitFor();
        await page.waitForTimeout(800);
        const scan = async (state) => {
          const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          checks++;
          if (result.violations.length) { violations += result.violations.length; problems.push(`${label} ${state}: ${result.violations.map((v) => v.id).join(", ")}`); }
        };
        await scan("results");
        await page.getByTestId("result-embeddings-1").getByRole("button", { name: /^View profile/ }).click();
        await page.getByTestId("profile-text").waitFor();
        await scan("profile dialog");
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: /^Compare [A-Z]/ }).nth(0).click();
        await page.getByRole("button", { name: /^Compare [A-Z]/ }).nth(1).click();
        await scan("compare tray");
        await page.getByRole("button", { name: "Compare profiles" }).click();
        await page.getByTestId("in-common").waitFor();
        await scan("compare dialog");
        done = true;
      } catch (error) {
        if (/crash/i.test(String(error.message))) crashes++; else { problems.push(`${label}: ${String(error.message).split("\n")[0]}`); done = true; }
      } finally { await context.close(); }
    }
    if (!done) problems.push(`/discover ${scheme} ${size}: the browser crashed three times`);
  }
}
await browser.close();
console.log(`${process.argv[2] ?? "firefox"} ${await Promise.resolve(engine.name?.() ?? "")}: ${checks} axe checks completed, ${violations} violations, ${crashes} browser crashes retried`);
for (const p of problems) console.log("  PROBLEM:", p);
process.exit(problems.length ? 1 : 0);
