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
