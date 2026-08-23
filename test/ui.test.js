import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildState } from "../src/server.js";

/**
 * Render the UI against a stub DOM.
 *
 * Every other test here checks data. None rendered the page, so a broken
 * render shipped with 67 tests green: a merge left `cur` referenced after the
 * variable was refactored away, and the console showed no runs, no history, no
 * graph and no Docs tab while the API returned all of it correctly.
 *
 * The stub is deliberately permissive — a Proxy that absorbs any property or
 * call — so this fails on genuine errors in the script (an undefined
 * identifier, a bad property access on real data) rather than on whichever DOM
 * method the UI happens to use next.
 */
function stubDom() {
  const node = () =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return undefined; // not a thenable
        if (prop === Symbol.toPrimitive || prop === "toString") return () => "";
        if (prop === "length") return 0;
        if (prop === Symbol.iterator) return [][Symbol.iterator].bind([]);
        if (prop === "classList" || prop === "style" || prop === "dataset") return node();
        return node();
      },
      set: () => true,
      apply: () => node(),
      has: () => true,
    });

  const doc = node();
  return {
    document: doc,
    window: node(),
    console: { log() {}, error() {}, warn() {} },
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Set,
    Map,
    isNaN,
    parseInt,
    parseFloat,
  };
}

async function uiScript() {
  const html = await readFile(new URL("../src/ui/index.html", import.meta.url), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "index.html must contain the UI script");
  return m[1];
}

test("the UI script runs against real state without throwing", async () => {
  const sandbox = stubDom();
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // Define the script, then call draw() with a real payload — the same shape
  // the server actually returns, so a field rename shows up here.
  vm.runInContext(await uiScript(), sandbox, { timeout: 5000 });

  const state = buildState(process.cwd());
  assert.doesNotThrow(() => {
    vm.runInContext("draw(__state)", Object.assign(sandbox, { __state: state }), {
      timeout: 5000,
    });
  }, "draw() threw on a real state payload");
});

test("draw survives an empty project with no sessions", async () => {
  const sandbox = stubDom();
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(await uiScript(), sandbox, { timeout: 5000 });

  const empty = {
    generatedAt: new Date().toISOString(),
    uiVersion: "test",
    serverStale: false,
    sources: [],
    problems: [],
    current: null,
    sessions: [],
    documents: [],
    lifetime: { sessions: 0, runs: 0, running: 0, tokens: 0, outputTokens: 0, toolCalls: 0, agentSeconds: 0 },
  };
  assert.doesNotThrow(() => {
    vm.runInContext("draw(__empty)", Object.assign(sandbox, { __empty: empty }), { timeout: 5000 });
  }, "draw() threw with no sessions — the first-run case");
});

test("addresses and sharing controls collapse, and open when actually shared", async () => {
  // Addresses are configuration, not status — needed when you go looking,
  // noise otherwise. But a console reachable beyond this machine is a state
  // worth seeing without asking, so sharing forces it open.
  const html = await readFile(new URL("../src/ui/index.html", import.meta.url), "utf8");
  const fn = html.slice(html.indexOf("function renderAccess"));

  assert.match(fn, /<details class="accessdisc"/, "access panel must be a details element");
  assert.match(fn, /const open\s*=\s*sharing\s*\|\|/, "sharing must force the panel open");
  assert.match(fn, /at-access-open/, "the open/closed choice must be remembered");

  // localStorage throws in private mode; the console must not break there.
  const guarded = fn.slice(fn.indexOf("at-access-open") - 300, fn.indexOf("at-access-open") + 400);
  assert.match(guarded, /try\s*\{/, "localStorage access must be guarded");

  // The summary has to say something useful while collapsed, or collapsing it
  // just hides whether the console is exposed.
  assert.match(fn, /this machine only/, "collapsed summary must state the reachability");
});
