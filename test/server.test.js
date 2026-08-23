import { readFile, readdir, writeFile } from "node:fs/promises";
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

test("the build hash covers every source file, not a hand-kept list", async () => {
  // The first version named six files and missed eight, reproducing the bug it
  // was written to fix. Asserting that three names are PRESENT passed happily
  // with prices.js absent — it pinned an incomplete list rather than guarding
  // completeness. This asserts the count instead, so a new file cannot be
  // silently excluded.
  const srcDir = new URL("../src/", import.meta.url);
  const onDisk = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".js") || e.name.endsWith(".html")) onDisk.push(e.name);
    }
  };
  await walk(srcDir);

  const server = await import("../src/server.js");
  const before = server.buildState(process.cwd()).uiVersion;

  // Touching ANY source file must move the hash. prices.js is the sharp case:
  // the README tells the reader to edit it, and it changes every dollar figure.
  const prices = new URL("../src/prices.js", import.meta.url);
  const original = await readFile(prices, "utf8");
  try {
    await writeFile(prices, original + "\n// staleness probe\n");
    const after = server.buildState(process.cwd()).uiVersion;
    assert.notEqual(after, before, "editing prices.js must change the build hash");
  } finally {
    await writeFile(prices, original);
  }

  assert.ok(onDisk.length >= 13, `expected the walk to see every source file, saw ${onDisk.length}`);
});

test("a stale server is told to restart, never to reload", async () => {
  const src = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /serverStale/, "payload must expose serverStale");

  const ui = await readFile(new URL("../src/ui/index.html", import.meta.url), "utf8");
  const banner = ui.slice(ui.indexOf("stale-server"), ui.indexOf("stale-server") + 500);
  assert.match(banner, /restart/i, "stale-server banner must say restart");

  // The previous version only checked that "restart" was present, so "reload
  // the page, or restart it" would have passed. Reloading cannot fix a stale
  // process — but the banner should still mention it, because reloading is
  // the reader's instinct and saying it will not help is worth the words.
  // So: reload may appear only as a negation, never as an instruction.
  for (const m of banner.matchAll(/reload\w*/gi)) {
    const context = banner.slice(Math.max(0, m.index - 60), m.index + 60);
    assert.match(
      context,
      /\bnot\b|\bwon'?t\b|\bcannot\b/i,
      `"${m[0]}" appears in the stale-server banner without a negation — it reads as an instruction`
    );
  }
});
