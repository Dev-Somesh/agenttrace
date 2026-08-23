/**
 * Shared source helpers. Vendor-neutral: path hygiene and jsonl reading.
 *
 * Existence checks apply only when `mustExist` is set — that is, for paths
 * scraped out of shell commands. A regex can invent a name that was never a
 * file. Paths a tool named explicitly are always real, and checking those
 * would erase the history of every file since deleted.
 */
import fs from "node:fs";
import path from "node:path";

export function readJsonl(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* a live session may be mid-write */
    }
  }
  return out;
}

export function repoRelative(repoRoot, p, mustExist = false) {
  if (typeof p !== "string" || !p) return null;
  const abs = path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
  if (!abs.startsWith(repoRoot)) return null;
  const rel = abs.slice(repoRoot.length).replace(/^\/+/, "");
  if (!rel || rel.startsWith("node_modules") || rel.startsWith("dist")) return null;
  if (mustExist && !fs.existsSync(abs)) return null;
  return rel;
}

/**
 * File-like tokens pulled out of a shell command. Always existence-checked.
 */
// `\b` after the extension stops `jsx?` eating the `js` in `package.json`
// and inventing `package.js` — the exact false positive this check exists for.
const FILE_RE =
  /(?:^|[\s"'><|])((?:[\w.@-]+\/)*[\w.@-]+\.(?:tsx?|jsx?|mjs|cjs|css|html|json|md|ya?ml|py|go|rs|rb|sh))\b/g;

export function filesFromCommand(command, repoRoot) {
  const out = new Set();
  if (typeof command !== "string") return out;
  for (const m of command.matchAll(FILE_RE)) {
    const rel = repoRelative(repoRoot, m[1], true);
    if (rel) out.add(rel);
  }
  return out;
}
