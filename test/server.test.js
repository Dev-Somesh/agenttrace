import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.js";

async function json(url, opts) {
  const res = await fetch(url, opts);
  assert.ok(res.ok, `${url} → ${res.status}`);
  return res.json();
}

test("serves project name and every address; default is localhost-only", async () => {
  const app = createApp({ cwd: process.cwd(), port: 0, lan: false });
  const info = await app.start();
  try {
    assert.equal(info.host, "127.0.0.1");
    assert.ok(info.port > 0);
    assert.ok(info.urls.some((u) => u.kind === "local" && u.live));
    const state = await json(`http://127.0.0.1:${info.port}/api/state`);
    assert.equal(state.project, info.project);
    assert.ok(Array.isArray(state.now));
    assert.ok(Array.isArray(state.across));
    assert.equal(state.access.lan, false);
    assert.ok(state.access.urls.every((u) => u.kind === "local" ? u.live : !u.live));
  } finally {
    await app.close();
  }
});

test("setLan marks every listed URL live, then off again", async () => {
  const app = createApp({ cwd: process.cwd(), port: 0, lan: false });
  await app.start();
  try {
    const on = await app.setLan(true);
    assert.equal(on.lan, true);
    assert.ok(on.urls.every((u) => u.live));
    const off = await app.setLan(false);
    assert.equal(off.lan, false);
    assert.ok(off.urls.filter((u) => u.kind !== "local").every((u) => !u.live));
  } finally {
    await app.close();
  }
});

test("the build hash covers server sources, not just the UI", async () => {
  // Hashing the UI alone left a blind spot: a process started before a fix
  // keeps serving stale logic while the UI hash still matches, so the page
  // looks healthy and reports wrong data. That happened for 29 minutes.
  const src = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /BUILD_FILES/, "build hash must be computed over a file list");
  for (const f of ["server.js", "analyse.js", "claude-code.js"]) {
    assert.ok(src.includes(f), `${f} must be part of the build hash`);
  }
});

test("state reports whether the server itself is stale", async () => {
  const src = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /serverStale/, "payload must expose serverStale");
  const ui = await readFile(new URL("../src/ui/index.html", import.meta.url), "utf8");
  // Reloading cannot fix a stale process — the message must not say "reload".
  assert.match(ui, /restart it/i, "stale-server message must say restart, not reload");
});
