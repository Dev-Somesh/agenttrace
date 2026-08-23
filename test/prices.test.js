import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCostUsd, priceFor, sumCostUsd } from "../src/prices.js";
import { parseSince, filterSessions, lifetime } from "../src/analyse.js";
import { snapshotHtml } from "../src/export.js";

test("priceFor matches the longest model-family prefix", () => {
  assert.equal(priceFor("claude-sonnet-4-20250514").input, 3);
  assert.equal(priceFor("claude-opus-4-1").input, 15);
  assert.equal(priceFor("unknown-model-9"), null);
  assert.equal(priceFor(null), null);
});

// The bug this guards: "claude-opus-5" contains "claude-opus", so a generic
// entry for the older family priced the current model at three times its
// rate. Every current model needs its own key, and no generic fallback may
// stand in for one — an unlisted model must report nothing at all.
test("a current model is never priced by an older family prefix", () => {
  assert.equal(priceFor("claude-opus-5").input, 5);
  assert.equal(priceFor("claude-opus-5").output, 25);
  assert.equal(priceFor("claude-sonnet-5").input, 3);
  assert.equal(priceFor("claude-haiku-4-5").input, 1);
  assert.equal(priceFor("claude-opus-4-8").input, 5);
  assert.equal(priceFor("claude-opus-6-future"), null);
});

test("cache reads are billed even though they are not counted as tokens", () => {
  // 1M cache reads on opus-5: no consumed tokens at all, but $0.50 of spend.
  const read = estimateCostUsd(0, 0, "claude-opus-5", { read: 1_000_000 });
  assert.ok(Math.abs(read - 0.5) < 1e-9, `expected 0.5, got ${read}`);

  // Cache writes cost more than plain input, and are not charged twice
  // even though `tokens` already contains them.
  const write = estimateCostUsd(1_000_000, 0, "claude-opus-5", { write: 1_000_000 });
  assert.ok(Math.abs(write - 6.25) < 1e-9, `expected 6.25, got ${write}`);

  // A source that records no cache tokens keeps the old behaviour exactly.
  assert.equal(estimateCostUsd(1_000_000, 0, "claude-opus-5"), 5);
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

// A runner that records no usage reports 0 tokens because the Run shape needs
// a number. 0 must never be read as "free": it is not summed and not priced.
test("a run with no recorded usage is excluded from totals, not counted as zero", () => {
  const cursorRun = { usageRecorded: false, tokens: 0, outputTokens: 0, model: null };
  const realRun = { tokens: 1000, outputTokens: 0, model: "claude-opus-5" };

  // Priced alone, it yields no estimate at all rather than $0.
  assert.equal(sumCostUsd([cursorRun]), null);

  // Mixed with a measured run, it must not drag the cost down.
  assert.equal(sumCostUsd([cursorRun, realRun]), sumCostUsd([realRun]));

  const mixed = lifetime([
    { runs: [cursorRun, realRun], totals: {} },
  ]);
  assert.equal(mixed.tokens, 1000, "unmeasured run must not be summed");
  assert.equal(mixed.unmeasuredRuns, 1, "and the omission must be reported");
});

// The README tells the reader to edit src/prices.js. Under npx that file is in
// a node_modules cache and the edit is lost on the next run, so the one
// documented modification of this tool did not survive. A price block beside
// the project does.
test("agenttrace.json overrides the shipped rates", async (t) => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { loadPriceOverrides, priceFor, setPriceOverrides } = await import("../src/prices.js");
  t.after(() => setPriceOverrides({}));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "at-prices-"));

  // No config at all is the normal case, and must not complain.
  assert.deepEqual(loadPriceOverrides(dir), { applied: 0, problem: null });
  assert.equal(priceFor("claude-opus-5").input, 5, "defaults still apply");

  // A negotiated rate replaces the shipped one; an unlisted model can be added.
  fs.writeFileSync(
    path.join(dir, "agenttrace.json"),
    JSON.stringify({ prices: { "claude-opus-5": { input: 2, output: 9 }, "in-house-7": { input: 0, output: 0 } } })
  );
  assert.equal(loadPriceOverrides(dir).applied, 2);
  assert.equal(priceFor("claude-opus-5").input, 2, "reader's rate wins");
  assert.equal(priceFor("claude-sonnet-5").input, 3, "untouched models keep the default");
  assert.deepEqual(priceFor("in-house-7"), { input: 0, output: 0 });

  // Broken config must be reported, never silently ignored.
  fs.writeFileSync(path.join(dir, "agenttrace.json"), "{ not json");
  assert.match(loadPriceOverrides(dir).problem, /not valid JSON/);

  fs.writeFileSync(path.join(dir, "agenttrace.json"), JSON.stringify({ prices: { "x-1": { input: "free" } } }));
  const bad = loadPriceOverrides(dir);
  assert.equal(bad.applied, 0);
  assert.match(bad.problem, /numeric input and output/);

  fs.rmSync(dir, { recursive: true, force: true });
});
