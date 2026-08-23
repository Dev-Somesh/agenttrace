import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCostUsd, priceFor, sumCostUsd } from "../src/prices.js";
import { parseSince, filterSessions } from "../src/analyse.js";
import { snapshotHtml } from "../src/export.js";

test("priceFor matches the longest model-family prefix", () => {
  assert.equal(priceFor("claude-sonnet-4-20250514").input, 3);
  assert.equal(priceFor("claude-opus-4.5").input, 15);
  assert.equal(priceFor("unknown-model-9"), null);
  assert.equal(priceFor(null), null);
});

test("estimateCostUsd prices leftover tokens as input and returns null when unknown", () => {
  // 1000 consumed, 200 output → 800 input. 800*3 + 200*15 = 5400 / 1e6
  const n = estimateCostUsd(1000, 200, "claude-sonnet-5");
  assert.ok(Math.abs(n - 0.0054) < 1e-9);
  assert.equal(estimateCostUsd(1000, 200, "mystery"), null);
});

test("sumCostUsd is null when no run has a known price", () => {
  assert.equal(sumCostUsd([{ tokens: 10, outputTokens: 1, model: null }]), null);
  assert.ok(sumCostUsd([{ tokens: 1000, outputTokens: 0, model: "claude-sonnet-5" }]) > 0);
});

test("parseSince accepts relative windows and ISO dates", () => {
  const now = Date.parse("2026-08-23T12:00:00.000Z");
  assert.equal(parseSince("1h", now), now - 3_600_000);
  assert.equal(parseSince("7d", now), now - 7 * 86_400_000);
  assert.equal(parseSince("2026-08-01T00:00:00.000Z"), Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(parseSince("nope"), null);
  assert.equal(parseSince(null), null);
});

test("filterSessions drops runs that went quiet before the cutoff", () => {
  const sessions = [
    {
      runs: [
        { id: "old", lastActivityAt: "2026-01-01T00:00:00.000Z" },
        { id: "new", lastActivityAt: "2026-08-23T00:00:00.000Z" },
      ],
    },
    { runs: [{ id: "ancient", lastActivityAt: "2025-01-01T00:00:00.000Z" }] },
  ];
  const cut = Date.parse("2026-08-01T00:00:00.000Z");
  const kept = filterSessions(sessions, cut);
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0].runs.map((r) => r.id), ["new"]);
});

test("snapshotHtml injects frozen state and does not invent a fetch", () => {
  const html = snapshotHtml("<html><script>tick()</script></html>", { cwd: "/tmp/x" });
  assert.match(html, /window\.__SNAPSHOT__=\{"cwd":"\/tmp\/x","documents":\[\]\}/);
  assert.ok(html.indexOf("window.__SNAPSHOT__") < html.indexOf("tick()"));
});

test("snapshotHtml strips documents so a PR file cannot leak user plans", () => {
  const html = snapshotHtml("<html><script></script></html>", {
    cwd: "/tmp/x",
    documents: [{ id: "user-plans", items: [{ markdown: "secret" }] }],
  });
  assert.ok(!html.includes("secret"));
});
