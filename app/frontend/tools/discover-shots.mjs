// Screenshots of the Profile Discovery states: node tools/discover-shots.mjs URL OUTPUT_DIR
// Landing, a filled form, results from both methods, the profile dialog, and the comparison dialog.
// Light and dark, desktop and phone. Reduced motion is requested so the images are steady.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [url = "http://127.0.0.1:8080", out = "shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const browser = await chromium.launch({ channel: "chrome" });
for (const scheme of ["dark", "light"]) {
  for (const [sizeName, viewport] of Object.entries(SIZES)) {
    const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await context.newPage();
    const shot = (name, full = false) => page.screenshot({ path: `${out}/${name}-${sizeName}-${scheme}.png`, fullPage: full });
    await page.goto(url + "/discover");
    await page.getByRole("status").first().waitFor();
    await page.getByRole("group", { name: "Start from an example" }).getByRole("button").first().waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(300);
    await shot("landing");
    await shot("landing-full", true);
    await page.getByRole("group", { name: "Start from an example" }).getByRole("button").first().click();
    await page.getByRole("button", { name: "Find similar profiles" }).click();
    await page.getByRole("heading", { level: 3 }).first().waitFor();
    await page.waitForTimeout(1500);
    await shot("results-full", true);
    if (sizeName === "desktop") await page.getByRole("tab").first().waitFor().catch(() => {});
    await page.getByRole("button", { name: /^View profile/ }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(400);
    await shot("profile-dialog");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Compare / }).nth(0).click();
    await page.getByRole("button", { name: /^Compare / }).nth(1).click();
    await page.getByRole("button", { name: "Compare profiles" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(600);
    await shot("compare-dialog");
    await context.close();
  }
}
await browser.close();
console.log("written to", out);
