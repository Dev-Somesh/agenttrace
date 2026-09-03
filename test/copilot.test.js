import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copilot } from "../src/sources/copilot.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, "fixtures", "copilot", "events.jsonl");

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-cp-"));
  const cwd = path.join(tmp, "repo");
  const root = path.join(tmp, "session-state");
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".github", "instructions"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export {}\n");
  fs.writeFileSync(path.join(cwd, "package.json"), "{}\n");
  fs.writeFileSync(path.join(cwd, ".github", "instructions", "style.md"), "# Style\nBe brief.\n");

  const dest = path.join(root, "sess-copilot-1");
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "events.jsonl"), fs.readFileSync(FIX, "utf8").replaceAll("__CWD__", cwd));

  const other = path.join(root, "other");
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(
    path.join(other, "events.jsonl"),
    fs.readFileSync(FIX, "utf8").replaceAll("__CWD__", path.join(tmp, "elsewhere"))
  );

  return { cwd, root };
}

test("only sessions whose cwd is this project are kept", () => {
  const { cwd, root } = stage();
  const sessions = copilot.sessions({ cwd, root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sourceId, "copilot");
  assert.equal(sessions[0].runs[0].name, "Rewrite src/app.ts");
  assert.equal(sessions[0].runs[0].model, "gpt-4.1");
});

test("shutdown usage is authoritative; reasoning is not double-counted", () => {
  const { cwd, root } = stage();
  const run = copilot.sessions({ cwd, root })[0].runs[0];
  // input 1000 + (220-20) output + 50 cache write = 1250
  assert.equal(run.tokens, 1250);
  assert.equal(run.outputTokens, 200);
  assert.equal(run.cacheReadTokens, 400);
  assert.equal(run.cacheWriteTokens, 50);
  assert.equal(run.usageRecorded, true);
});

test("writes stay; scraped shell names are existence-checked", () => {
  const { cwd, root } = stage();
  const run = copilot.sessions({ cwd, root })[0].runs[0];
  assert.ok(run.writes.includes("src/gone.ts"));
  assert.ok(run.reads.includes("src/app.ts"));
  assert.ok(run.reads.includes("package.json"));
  assert.ok(!run.reads.includes("package.js"));
  assert.equal(run.toolCalls, 3);
});

test("project instructions are documents", () => {
  const { cwd } = stage();
  const docs = copilot.documents({ cwd });
  assert.equal(docs[0].id, "project-instructions");
  assert.equal(docs[0].items[0].name, "style");
});
