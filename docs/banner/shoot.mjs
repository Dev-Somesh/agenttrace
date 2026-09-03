// Renders banner.html to docs/screenshots/banner.png at 2x.
//
// playwright is not a dependency of this project — it is resolved from
// wherever the person rendering this happens to have it.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "..", "screenshots", "banner.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 500 },
  deviceScaleFactor: 2,
});
await page.goto("file://" + path.join(DIR, "banner.html"), { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT });
await browser.close();
console.log("wrote", path.relative(process.cwd(), OUT));
