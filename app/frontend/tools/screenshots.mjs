// Take reference screenshots of the running app: node tools/screenshots.mjs URL OUTPUT_DIR
// Pages x light and dark x desktop and phone. Reduced motion is requested so the images are steady.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [url = "http://127.0.0.1:8080", out = "shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PAGES = [["home", "/"], ["discover", "/discover"], ["about", "/about"]];
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const browser = await chromium.launch({ channel: "chrome" });
for (const scheme of ["dark", "light"]) {
  for (const [sizeName, viewport] of Object.entries(SIZES)) {
    const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const [name, path] of PAGES) {
      await page.goto(url + path);
      await page.getByRole("status").first().waitFor();
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${name}-${sizeName}-${scheme}.png`, fullPage: false });
      if (name === "home") await page.screenshot({ path: `${out}/${name}-${sizeName}-${scheme}-full.png`, fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
console.log("screenshots written to", out);
