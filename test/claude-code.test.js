import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeCode } from "../src/sources/claude-code.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, "fixtures", "claude-code");
const encode = (p) => p.replace(/[/\s]+/g, "-");

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-cc-"));
  const cwd = path.join(tmp, "repo");
  const root = path.join(tmp, "projects");
  const home = path.join(tmp, "home");
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export {}\n");
  fs.writeFileSync(path.join(cwd, "package.json"), "{}\n");

  const proj = path.join(root, encode(cwd));
  const subs = path.join(proj, "sess-1", "subagents");
  fs.mkdirSync(subs, { recursive: true });
  fs.copyFileSync(path.join(FIX, "parent.jsonl"), path.join(proj, "sess-1.jsonl"));
  fs.copyFileSync(path.join(FIX, "run-writer.jsonl"), path.join(subs, "agent-run-writer.jsonl"));
  fs.copyFileSync(path.join(FIX, "run-writer.meta.json"), path.join(subs, "agent-run-writer.meta.json"));
  fs.copyFileSync(path.join(FIX, "run-reader.jsonl"), path.join(subs, "agent-run-reader.jsonl"));
  fs.copyFileSync(path.join(FIX, "run-reader.meta.json"), path.join(subs, "agent-run-reader.meta.json"));

  // A parent with no subagents must not become a session.
  fs.writeFileSync(path.join(proj, "lone.jsonl"), '{"type":"assistant"}\n');

  fs.mkdirSync(path.join(cwd, ".claude", "agents"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "agents", "review.md"), "# Reviewer\n");
  fs.mkdirSync(path.join(cwd, ".claude", "plans"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude", "skills", "demo"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "skills", "demo", "SKILL.md"), "# Demo skill\n");
  fs.mkdirSync(path.join(home, ".claude", "commands"), { recursive: true });

  return { tmp, cwd, root, home };
}

test("sessions come from fixture transcripts, not from a parent with no subagents", () => {
  const { cwd, root } = stage();
  const sessions = claudeCode.sessions({ cwd, root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].runs.length, 2);
});

test("cache reads are excluded from token totals", () => {
  const { cwd, root } = stage();
  const [session] = claudeCode.sessions({ cwd, root });
  const writer = session.runs.find((r) => r.id === "run-writer");
  // 1+0 + 10+4+2 + 8+20 + 4+6 + 2+3 = 60. The 5000 cache reads are not in it.
  assert.equal(writer.tokens, 60);
  assert.equal(writer.outputTokens, 33);
  // Parent totals: 100+20+50 + 10+5 = 185. The 99999 cache read is not in it.
  assert.equal(session.totals.tokens, 185);
  assert.equal(session.totals.outputTokens, 25);
});

test("synthetic model ids are skipped", () => {
  const { cwd, root } = stage();
  const writer = claudeCode.sessions({ cwd, root })[0].runs.find((r) => r.id === "run-writer");
  assert.equal(writer.model, "claude-sonnet-5");
  assert.equal(writer.effort, "high");
});

test("sidecar meta supplies the name, kind and depth", () => {
  const { cwd, root } = stage();
  const writer = claudeCode.sessions({ cwd, root })[0].runs.find((r) => r.id === "run-writer");
  assert.equal(writer.name, "Rewrite the app");
  assert.equal(writer.kind, "general-purpose");
  assert.equal(writer.depth, 1);
});

test("explicit tool paths stay even when the file is gone", () => {
  const { cwd, root } = stage();
  const writer = claudeCode.sessions({ cwd, root })[0].runs.find((r) => r.id === "run-writer");
  assert.ok(writer.writes.includes("src/gone.ts"));
  assert.ok(!writer.reads.includes("src/gone.ts"));
});

test("scraped shell paths are existence-checked; invented names are dropped", () => {
  const { cwd, root } = stage();
  const writer = claudeCode.sessions({ cwd, root })[0].runs.find((r) => r.id === "run-writer");
  assert.ok(writer.reads.includes("package.json"));
  assert.ok(!writer.reads.includes("package.js"));
  assert.ok(writer.reads.includes("src/app.ts"));
});

test("a mid-write jsonl line does not take the rest of the file down", () => {
  const { cwd, root } = stage();
  const writer = claudeCode.sessions({ cwd, root })[0].runs.find((r) => r.id === "run-writer");
  assert.equal(writer.toolCalls, 4);
  assert.equal(writer.turns, 5);
});

test("status is inferred from write recency, not asserted", () => {
  const { cwd, root } = stage();
  const writer = claudeCode.sessions({ cwd, root })[0].runs.find((r) => r.id === "run-writer");
  assert.equal(writer.status, "finished");
});

test("documents omit empty directories rather than showing empty headings", () => {
  const { cwd } = stage();
  const docs = claudeCode.documents({ cwd });
  assert.deepEqual(docs.map((c) => c.id), ["project-agents"]);
  assert.ok(!docs.some((c) => c.id.endsWith("plans") || c.id.endsWith("commands")));
});

test("documents from the home directory of another project are ignored", () => {
  const { cwd } = stage();
  const docs = claudeCode.documents({ cwd });
  assert.ok(!docs.some((c) => c.items.some((it) => it.name === "demo")));
});

test("documents are read from the user root as well as the project root", () => {
  // A refactor dropped the user root, so plans — which live in ~/.claude/plans,
  // not <cwd>/.claude — stopped being found. Because sample documents appear
  // when a project has none, the failure rendered as a working empty state
  // rather than as a bug. Assert both roots are scanned.
  const src = readFileSync(new URL("../src/sources/claude-code.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("claudeCode.documents"));
  assert.match(fn, /os\.homedir\(\)/, "user root (~/.claude) must be scanned");
  assert.match(fn, /cwd, "\.claude"/, "project root (<cwd>/.claude) must be scanned");
  assert.match(fn, /scope: "user"/, "user-scope collections must be labelled");
});

test("sample documents stand in for nothing, they do not replace something", () => {
  // The fallback is correct only while it is a fallback. If it ever fires with
  // real documents present, a real plan disappears behind a sample.
  const src = readFileSync(new URL("../src/sources/index.js", import.meta.url), "utf8");
  assert.match(
    src,
    /if\s*\(\s*!out\.length\s*\)/,
    "examples must be added only when nothing real was found"
  );
});

test("a project sees its own plan, and not another project's", () => {
  // Plans live in ~/.claude/plans, which is user-wide. Scanning it wholesale
  // would show one project's plans inside another; not scanning it at all
  // meant plans were never visible, since there is no project-scoped plans
  // directory. Sessions record the slug of the plan they worked from, and that
  // slug is the filename — so match on it.
  const src = readFileSync(new URL("../src/sources/claude-code.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("claudeCode.documents"));
  assert.match(fn, /projectSlugs/, "user plans must be filtered by session slug");
  assert.doesNotMatch(
    fn,
    /for \(const kind of DOC_KINDS\)[\s\S]{0,200}homedir/,
    "the user root must not be walked kind-by-kind — that returns other projects' documents"
  );

  // The slug is stamped on subagent transcripts, not reliably near the top of
  // a session file. Scanning only session files finds nothing.
  const slugFn = src.slice(src.indexOf("function projectSlugs"));
  assert.match(slugFn, /subagents/, "slug scan must include subagent transcripts");
});
