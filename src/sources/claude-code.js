/**
 * Claude Code source.
 *
 * Reads transcripts from ~/.claude/projects/<encoded-cwd>/, where each session
 * is a .jsonl file alongside a directory of the subagents it spawned.
 *
 * Everything vendor-specific lives here: the paths, the record shape, the
 * sidecar files. The rest of agenttrace only sees the normalised types.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { consumedTokens, statusFromLastWrite } from "./types.js";

const ROOT = path.join(os.homedir(), ".claude", "projects");

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Parsed transcripts, invalidated on mtime — history re-reads a lot. */
const cache = new Map();

function readJsonl(file) {
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

/**
 * Claude encodes a project path by replacing separators AND whitespace with
 * "-", so "/a/My Repo/b" becomes "-a-My-Repo-b".
 */
const encode = (p) => p.replace(/[/\s]+/g, "-");

function projectDir(cwd) {
  const direct = path.join(ROOT, encode(cwd));
  if (fs.existsSync(direct)) return direct;
  // Fall back to a case-insensitive match on the encoded name.
  const want = encode(cwd).toLowerCase();
  try {
    const hit = fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .find((d) => d.name.toLowerCase() === want || want.endsWith(d.name.toLowerCase()));
    return hit ? path.join(ROOT, hit.name) : null;
  } catch {
    return null;
  }
}

function makeRelative(repoRoot, p, mustExist = false) {
  if (typeof p !== "string" || !p) return null;
  const abs = path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
  if (!abs.startsWith(repoRoot)) return null;
  const rel = abs.slice(repoRoot.length).replace(/^\/+/, "");
  if (!rel || rel.startsWith("node_modules") || rel.startsWith("dist")) return null;
  // Only paths scraped out of shell commands need checking against disk: a
  // regex can invent a name that was never a file. Paths a tool named
  // explicitly are always real, and checking those would erase the history of
  // every file since deleted.
  if (mustExist && !fs.existsSync(abs)) return null;
  return rel;
}

function filesTouched(block, repoRoot) {
  const input = block?.input || {};
  const out = new Set();
  for (const key of ["file_path", "path", "notebook_path"]) {
    const rel = makeRelative(repoRoot, input[key]);
    if (rel) out.add(rel);
  }
  if (typeof input.command === "string") {
    for (const m of input.command.matchAll(
      /(?:^|[\s"'><|])((?:[\w.@-]+\/)*[\w.@-]+\.(?:tsx?|jsx?|mjs|cjs|css|html|json|md|ya?ml|py|go|rs|rb|sh))/g
    )) {
      const rel = makeRelative(repoRoot, m[1], true);
      if (rel) out.add(rel);
    }
  }
  return out;
}

function parseRun(file, repoRoot) {
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.value;

  const records = readJsonl(file);
  if (!records.length) return null;

  const id = path.basename(file).replace(/^agent-/, "").replace(/\.jsonl$/, "");
  const reads = new Set();
  const writes = new Set();
  let model = null;
  let effort = null;
  let tokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  let turns = 0;
  let first = null;
  let last = null;

  for (const rec of records) {
    if (rec.timestamp) {
      first = first || rec.timestamp;
      last = rec.timestamp;
    }
    effort = effort || rec.effort || null;
    const msg = rec.message;
    if (!msg || typeof msg !== "object") continue;
    // Skip synthetic/meta model ids like "<synthetic>".
    if (!model && msg.model && !/^<.*>$/.test(msg.model)) model = msg.model;
    if (msg.usage) {
      tokens += consumedTokens(msg.usage);
      outputTokens += msg.usage.output_tokens || 0;
    }
    if (rec.type === "assistant") turns++;
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b?.type !== "tool_use") continue;
        toolCalls++;
        const target = WRITE_TOOLS.has(b.name) ? writes : reads;
        for (const f of filesTouched(b, repoRoot)) target.add(f);
      }
    }
  }

  // A file it wrote is not also counted as one it merely read.
  for (const w of writes) reads.delete(w);

  // The sidecar carries the authoritative name and type.
  let meta = null;
  try {
    meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
  } catch {
    /* older sessions predate the sidecar */
  }

  const value = {
    id,
    name: meta?.description || "(unnamed)",
    kind: meta?.agentType || null,
    model,
    effort,
    status: statusFromLastWrite(last),
    tokens,
    outputTokens,
    toolCalls,
    turns,
    startedAt: first,
    lastActivityAt: last,
    durationMs: first && last ? new Date(last) - new Date(first) : null,
    reads: [...reads].sort(),
    writes: [...writes].sort(),
    depth: meta?.spawnDepth ?? null,
  };
  cache.set(file, { mtime, value });
  return value;
}

/** Totals for the parent session itself, not its subagents. */
function sessionTotals(file) {
  let tokens = 0;
  let outputTokens = 0;
  let contextNow = 0;
  let model = null;
  for (const rec of readJsonl(file)) {
    const u = rec?.message?.usage;
    if (!u) continue;
    const m = rec?.message?.model;
    if (!model && m && !/^<.*>$/.test(m)) model = m;
    tokens += consumedTokens(u);
    outputTokens += u.output_tokens || 0;
    contextNow =
      (u.input_tokens || 0) +
      (u.cache_read_input_tokens || 0) +
      (u.cache_creation_input_tokens || 0);
  }
  return { tokens, outputTokens, toolCalls: 0, contextNow, model };
}

export const claudeCode = {
  id: "claude-code",
  label: "Claude Code",

  detect() {
    return fs.existsSync(ROOT);
  },

  sessions({ cwd }) {
    const dir = projectDir(cwd);
    if (!dir) return [];

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ id: f.replace(/\.jsonl$/, ""), file: path.join(dir, f) }));

    const out = [];
    for (const entry of files) {
      const subDir = path.join(dir, entry.id, "subagents");
      if (!fs.existsSync(subDir)) continue;
      const runs = fs
        .readdirSync(subDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => parseRun(path.join(subDir, f), cwd))
        .filter(Boolean)
        .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
      if (!runs.length) continue;

      const totals = sessionTotals(entry.file);
      totals.toolCalls = runs.reduce((n, r) => n + r.toolCalls, 0);

      out.push({
        id: entry.id,
        sourceId: "claude-code",
        startedAt: runs.map((r) => r.startedAt).filter(Boolean).sort()[0] || null,
        lastActivityAt:
          runs.map((r) => r.lastActivityAt).filter(Boolean).sort().pop() || null,
        runs,
        totals,
      });
    }
    return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  },
};

/**
 * Markdown Claude Code keeps alongside a project.
 *
 * Purely additive: a source that has no such concept omits `documents` and the
 * UI hides the tab. Only directories that actually exist and contain files are
 * returned, so an empty install shows nothing rather than four empty headings.
 */
const DOC_KINDS = [
  { id: "plans", label: "Plans" },
  { id: "skills", label: "Skills" },
  { id: "agents", label: "Agents" },
  { id: "commands", label: "Commands" },
];

const MAX_DOC_BYTES = 256 * 1024;

function readDocs(dir, scope, kind) {
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
    // A skill is a directory containing SKILL.md; a plan is a bare .md file.
    let file = full;
    if (stat.isDirectory()) {
      const inner = ["SKILL.md", "README.md", `${name}.md`].map((f) => path.join(full, f));
      file = inner.find((f) => fs.existsSync(f));
      if (!file) continue;
      stat = fs.statSync(file);
    } else if (!name.endsWith(".md")) {
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
      name: name.replace(/\.md$/, ""),
      path: file.replace(os.homedir(), "~"),
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      bytes: stat.size,
      markdown,
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items;
}

claudeCode.documents = function documents({ cwd }) {
  const roots = [
    { scope: "project", base: path.join(cwd, ".claude") },
    { scope: "user", base: path.join(os.homedir(), ".claude") },
  ];
  const out = [];
  for (const { scope, base } of roots) {
    for (const kind of DOC_KINDS) {
      const items = readDocs(path.join(base, kind.id), scope, kind.id);
      if (!items) continue;
      out.push({
        id: `${scope}-${kind.id}`,
        label: scope === "project" ? `${kind.label} (project)` : kind.label,
        scope,
        items,
      });
    }
  }
  return out;
};
