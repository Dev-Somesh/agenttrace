import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codex } from "../src/sources/codex.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, "fixtures", "codex", "rollout.jsonl");

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-cx-"));
  const cwd = path.join(tmp, "repo");
  const root = path.join(tmp, "sessions");
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export {}\n");
  fs.writeFileSync(path.join(cwd, "package.json"), "{}\n");
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Agents\nUse the console.\n");

  const dest = path.join(root, "2026", "03", "17");
  fs.mkdirSync(dest, { recursive: true });
  const body = fs.readFileSync(FIX, "utf8").replaceAll("__CWD__", cwd);
  fs.writeFileSync(path.join(dest, "rollout-2026-03-17T02-00-00-sess-codex-1.jsonl"), body);

  // A session from another project must not appear here.
  const other = body.replaceAll(cwd, path.join(tmp, "other"));
  fs.writeFileSync(path.join(dest, "rollout-2026-03-17T03-00-00-other.jsonl"), other);

  return { cwd, root };
}

test("only rollouts whose cwd is this project are sessions", () => {
  const { cwd, root } = stage();
  const sessions = codex.sessions({ cwd, root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sourceId, "codex");
  assert.equal(sessions[0].runs.length, 1);
  assert.equal(sessions[0].runs[0].name, "Rewrite src/app.ts to export a helper");
});

test("cached input is excluded from the token headline", () => {
  const { cwd, root } = stage();
  const run = codex.sessions({ cwd, root })[0].runs[0];
  // 1200 input - 1000 cached + 80 output = 280
  assert.equal(run.tokens, 280);
  assert.equal(run.outputTokens, 80);
  assert.equal(run.cacheReadTokens, 1000);
  assert.equal(run.model, "gpt-5.4");
});

test("apply_patch writes stay; scraped shell names are existence-checked", () => {
  const { cwd, root } = stage();
  const run = codex.sessions({ cwd, root })[0].runs[0];
  assert.ok(run.writes.includes("src/gone.ts"));
  assert.ok(run.reads.includes("src/app.ts"));
  assert.ok(run.reads.includes("package.json"));
  assert.ok(!run.reads.includes("package.js"));
  assert.equal(run.toolCalls, 2);
});

test("AGENTS.md is a document, not a scan of every markdown file", () => {
  const { cwd } = stage();
  const docs = codex.documents({ cwd });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].items[0].name, "AGENTS");
});
