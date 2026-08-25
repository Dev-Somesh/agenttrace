// playwright is not a dependency of this project — it is resolved from
// wherever the person rendering these happens to have it.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1700,height:1200}, deviceScaleFactor:2 });
const DIR = process.env.DIR || path.dirname(fileURLToPath(import.meta.url));
await p.goto("file://" + DIR + "/cards.html", { waitUntil:"networkidle" });
await p.waitForTimeout(400);
for (const [id,name] of [["li","social-linkedin-1200x627"],["x","social-x-1600x900"],["gh","social-github-1280x640"],["sq","social-square-1080x1080"]]) {
  await p.locator("#"+id).screenshot({ path:`${DIR}/${name}.png` });
  console.log("wrote", name);
}
await b.close();
