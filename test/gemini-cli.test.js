import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geminiCli } from "../src/sources/gemini-cli.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, "fixtures", "gemini-cli", "session.jsonl");

function hash(cwd) {
  return crypto.createHash("sha256").update(path.resolve(cwd)).digest("hex");
}

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-gm-"));
  const cwd = path.join(tmp, "repo");
  const root = path.join(tmp, "gemini");
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export {}\n");
  fs.writeFileSync(path.join(cwd, "package.json"), "{}\n");
  fs.writeFileSync(path.join(cwd, "GEMINI.md"), "# Gemini\nUse the console.\n");

  const chats = path.join(root, "tmp", hash(cwd), "chats");
  fs.mkdirSync(chats, { recursive: true });
  fs.copyFileSync(FIX, path.join(chats, "session-2026-03-17T02-00-sess-gemini-1.jsonl"));

  return { cwd, root };
}

test("a conversation is a session with one run", () => {
  const { cwd, root } = stage();
  const sessions = geminiCli.sessions({ cwd, root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sourceId, "gemini-cli");
  assert.equal(sessions[0].runs[0].name, "Rewrite src/app.ts");
  assert.equal(sessions[0].runs[0].model, "gemini-2.5-pro");
});

test("cached tokens are excluded from the headline; thoughts count as output", () => {
  const { cwd, root } = stage();
  const run = geminiCli.sessions({ cwd, root })[0].runs[0];
  // input 200 + output 40 + thoughts 10 = 250. cached 80 is not in it.
  assert.equal(run.tokens, 250);
  assert.equal(run.outputTokens, 50);
  assert.equal(run.cacheReadTokens, 80);
});

test("writes stay when the file is gone; invented shell names do not", () => {
  const { cwd, root } = stage();
  const run = geminiCli.sessions({ cwd, root })[0].runs[0];
  assert.ok(run.writes.includes("src/gone.ts"));
  assert.ok(run.reads.includes("src/app.ts"));
  assert.ok(run.reads.includes("package.json"));
  assert.ok(!run.reads.includes("package.js"));
  assert.equal(run.toolCalls, 3);
});

test("GEMINI.md is a document", () => {
  const { cwd } = stage();
  const docs = geminiCli.documents({ cwd });
  assert.equal(docs[0].items[0].name, "GEMINI");
});
