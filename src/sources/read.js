/**
 * Shared source helpers. Vendor-neutral: path hygiene and jsonl reading.
 *
 * Existence checks apply only when `mustExist` is set — that is, for paths
 * scraped out of shell commands. A regex can invent a name that was never a
 * file. Paths a tool named explicitly are always real, and checking those
 * would erase the history of every file since deleted.
 */
import fs from "node:fs";
import os from "node:os";
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

/**
 * True when `p` is this project or a path inside it.
 *
 * `startsWith` on the raw strings would treat `/Users/foo-bar` as inside
 * `/Users/foo`. The separator after the root is what makes the claim.
 */
export function sameProject(repoRoot, p) {
  if (typeof p !== "string" || !p) return false;
  const root = path.resolve(repoRoot);
  const abs = path.resolve(p);
  return abs === root || abs.startsWith(root + path.sep);
}

/** Recurse a tree, collecting files whose names pass `test`. */
export function walkFiles(dir, test) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (!test || test(e.name, full)) out.push(full);
    }
  }
  return out;
}

/**
 * The first complete JSONL records in a file, without reading the rest.
 *
 * Runners that shard every project into one tree (Codex, Copilot) need a cwd
 * check before a full parse. The metadata line is at the top; 64 kB covers it
 * without pulling a multi-megabyte rollout into memory for the wrong project.
 */
export function readJsonlHead(file, maxBytes = 64 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    const out = [];
    for (const line of buf.slice(0, n).toString("utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        break; // incomplete last line of the window
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

const MAX_DOC_BYTES = 256 * 1024;

/**
 * Markdown a runner keeps beside a project. Empty directories return null so
 * the Docs tab does not grow empty headings.
 */
export function listMarkdown(dir, { cwd, scope, kind, ext = [".md"] } = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const items = [];
  for (const name of names) {
    const full = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    let file = full;
    if (stat.isDirectory()) {
      const inner = ["SKILL.md", "README.md", `${name}.md`].map((f) => path.join(full, f));
      file = inner.find((f) => fs.existsSync(f));
      if (!file) continue;
      stat = fs.statSync(file);
    } else if (!ext.some((e) => name.endsWith(e))) {
      continue;
    }
    if (stat.size > MAX_DOC_BYTES) continue;
    let markdown = "";
    try {
      markdown = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    items.push({
      id: `${scope}:${kind}:${name}`,
      name: name.replace(/\.(md|mdc)$/, ""),
      path: file.replace(os.homedir(), "~"),
      rel: repoRelative(cwd, file),
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      bytes: stat.size,
      markdown,
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items;
}
