import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kiro } from "../src/sources/kiro.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, "fixtures", "kiro");

function encode(cwd) {
  return Buffer.from(path.resolve(cwd)).toString("base64").replace(/=+$/, "");
}

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-ki-"));
  const cwd = path.join(tmp, "repo");
  const root = path.join(tmp, "kiro.kiroagent");
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".kiro", "steering"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export {}\n");
  fs.writeFileSync(path.join(cwd, "package.json"), "{}\n");
  fs.writeFileSync(path.join(cwd, ".kiro", "steering", "product.md"), "# Product\nShip it.\n");

  const ws = path.join(root, "workspace-sessions", encode(cwd));
  fs.mkdirSync(ws, { recursive: true });
  const session = fs.readFileSync(path.join(FIX, "session.json"), "utf8").replaceAll("__CWD__", cwd);
  fs.writeFileSync(path.join(ws, "sess-kiro-1.json"), session);

  const execDir = path.join(root, "aabbccdd", "eeff0011");
  fs.mkdirSync(execDir, { recursive: true });
  fs.copyFileSync(path.join(FIX, "execution.json"), path.join(execDir, "0123456789abcdef0123456789abcdef"));

  return { cwd, root };
}

test("a workspace session is one conversation", () => {
  const { cwd, root } = stage();
  const sessions = kiro.sessions({ cwd, root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sourceId, "kiro");
  assert.equal(sessions[0].runs[0].name, "Rewrite src/app.ts");
  assert.equal(sessions[0].runs[0].usageRecorded, false);
});

test("credits are not reported as tokens", () => {
  const { cwd, root } = stage();
  const run = kiro.sessions({ cwd, root })[0].runs[0];
  assert.equal(run.tokens, 0);
  assert.equal(run.usageRecorded, false);
});

test("execution actions supply reads and writes", () => {
  const { cwd, root } = stage();
  const run = kiro.sessions({ cwd, root })[0].runs[0];
  assert.ok(run.reads.includes("src/app.ts"));
  assert.ok(run.writes.includes("src/gone.ts"));
  assert.ok(run.reads.includes("package.json"));
  assert.ok(!run.reads.includes("package.js"));
  assert.ok(run.toolCalls >= 3);
});

test("steering files are documents", () => {
  const { cwd } = stage();
  const docs = kiro.documents({ cwd });
  assert.equal(docs[0].id, "project-steering");
  assert.equal(docs[0].items[0].name, "product");
});
