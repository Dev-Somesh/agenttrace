import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cursor } from "../src/sources/cursor.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, "fixtures", "cursor");
const encode = (p) => p.replace(/^[\\/]+/, "").replace(/[/\\\s]+/g, "-");

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-cu-"));
  const cwd = path.join(tmp, "repo");
  const root = path.join(tmp, "projects");
  const home = path.join(tmp, "home");
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export {}\n");
  fs.writeFileSync(path.join(cwd, "package.json"), "{}\n");

  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const sessionDir = path.join(root, encode(cwd), "agent-transcripts", id);
  fs.mkdirSync(path.join(sessionDir, "subagents"), { recursive: true });
  fs.copyFileSync(path.join(FIX, "parent.jsonl"), path.join(sessionDir, `${id}.jsonl`));
  fs.copyFileSync(path.join(FIX, "subagent.jsonl"), path.join(sessionDir, "subagents", "sub-1.jsonl"));

  fs.mkdirSync(path.join(cwd, ".cursor", "rules"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".cursor", "rules", "style.mdc"), "# Style\nUse the existing voice.\n");
  fs.mkdirSync(path.join(cwd, ".cursor", "skills"), { recursive: true });
  fs.mkdirSync(path.join(home, ".cursor", "commands"), { recursive: true });

  return { cwd, root, home, id };
}

test("a conversation is a session; the parent and each subagent are runs", () => {
  const { cwd, root, id } = stage();
  const sessions = cursor.sessions({ cwd, root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, id);
  assert.equal(sessions[0].sourceId, "cursor");
  assert.equal(sessions[0].runs.length, 2);
});

test("the parent run takes its name from the first user query", () => {
  const { cwd, root, id } = stage();
  const parent = cursor.sessions({ cwd, root })[0].runs.find((r) => r.id === id);
  assert.equal(parent.name, "Rewrite the landing page");
  assert.equal(parent.kind, null);
  assert.equal(parent.depth, 0);
});

test("subagents are tagged as such", () => {
  const { cwd, root } = stage();
  const sub = cursor.sessions({ cwd, root })[0].runs.find((r) => r.id === "sub-1");
  assert.equal(sub.kind, "subagent");
  assert.equal(sub.depth, 1);
  assert.equal(sub.name, "Explore src/app.ts and report what it exports.");
});

test("a model recorded on a transcript is kept; otherwise it stays null", () => {
  const { cwd, root, id } = stage();
  const parent = path.join(root, encode(cwd), "agent-transcripts", id, `${id}.jsonl`);
  fs.appendFileSync(
    parent,
    `{"role":"assistant","model":"test-model-1","message":{"content":[{"type":"text","text":"ok"}]}}\n`
  );
  const run = cursor.sessions({ cwd, root })[0].runs.find((r) => r.id === id);
  assert.equal(run.model, "test-model-1");
});

test("tokens stay 0 because the transcript does not record usage", () => {
  const { cwd, root } = stage();
  const [session] = cursor.sessions({ cwd, root });
  assert.equal(session.totals.tokens, 0);
  for (const r of session.runs) {
    assert.equal(r.tokens, 0);
    assert.equal(r.model, null);
  }
});

test("explicit writes stay even when the file is gone; invented shell names do not", () => {
  const { cwd, root, id } = stage();
  const parent = cursor.sessions({ cwd, root })[0].runs.find((r) => r.id === id);
  assert.ok(parent.writes.includes("src/gone.ts"));
  assert.ok(parent.reads.includes("src/app.ts"));
  assert.ok(parent.reads.includes("package.json"));
  assert.ok(!parent.reads.includes("package.js"));
  assert.equal(parent.toolCalls, 3);
});

test("documents omit empty collections and accept .mdc rules", () => {
  const { cwd } = stage();
  const docs = cursor.documents({ cwd });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].id, "project-rules");
  assert.equal(docs[0].items[0].name, "style");
});
