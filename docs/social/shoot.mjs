// playwright is not a dependency of this project — it is resolved from
// wherever the person rendering these happens to have it.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

// The social platforms are given 2x so the cards stay sharp on retina
// timelines. GitHub is given 1x: its social preview wants the stated
// 1280x640 and silently declines to preview an image much larger, so a
// 2x render here costs the preview rather than buying anything.
const CARDS = [
  ["li", "social-linkedin-1200x627", 2],
  ["x", "social-x-1600x900", 2],
  ["gh", "social-github-1280x640", 1],
  ["sq", "social-square-1080x1080", 2],
];

const DIR = process.env.DIR || path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();

for (const scale of [...new Set(CARDS.map(([, , s]) => s))]) {
  const p = await b.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: scale });
  await p.goto("file://" + DIR + "/cards.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  for (const [id, name, s] of CARDS.filter(([, , s]) => s === scale)) {
    await p.locator("#" + id).screenshot({ path: `${DIR}/${name}.png` });
    console.log("wrote", name, `@${s}x`);
  }
  await p.close();
}

await b.close();
