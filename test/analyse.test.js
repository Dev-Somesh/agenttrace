import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedFiles, ownFiles, lifetime, concurrency } from "../src/analyse.js";

const run = (id, over = {}) => ({
  id, name: id, kind: null, model: null, status: "finished",
  tokens: 0, outputTokens: 0, toolCalls: 0, turns: 0,
  startedAt: null, lastActivityAt: null, durationMs: null,
  reads: [], writes: [], depth: 1, ...over,
});

test("sharedFiles links runs that touched the same file", () => {
  const shared = sharedFiles([
    run("a", { reads: ["src/app.ts", "a-only.ts"] }),
    run("b", { writes: ["src/app.ts"] }),
  ]);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].file, "src/app.ts");
  assert.deepEqual(shared[0].runs.sort(), ["a", "b"]);
});

test("a file only one run touched is not shared", () => {
  // Otherwise every file a single agent opened becomes a false connection.
  const shared = sharedFiles([run("a", { reads: ["solo.ts"] })]);
  assert.deepEqual(shared, []);
});

test("sharedFiles counts a read and a write as the same contact", () => {
  const shared = sharedFiles([
    run("a", { reads: ["x.ts"] }),
    run("b", { writes: ["x.ts"] }),
  ]);
  assert.equal(shared[0].runs.length, 2);
});

test("shared files are ordered by how many runs touched them", () => {
  const shared = sharedFiles([
    run("a", { reads: ["hot.ts", "warm.ts"] }),
    run("b", { reads: ["hot.ts", "warm.ts"] }),
    run("c", { reads: ["hot.ts"] }),
  ]);
  assert.equal(shared[0].file, "hot.ts");
  assert.equal(shared[0].runs.length, 3);
});

test("ownFiles excludes anything another run also touched", () => {
  const runs = [run("a", { writes: ["mine.ts", "ours.ts"] }), run("b", { reads: ["ours.ts"] })];
  assert.deepEqual(ownFiles(runs[0], sharedFiles(runs)), ["mine.ts"]);
});

test("lifetime sums across sessions without double counting", () => {
  const l = lifetime([
    { runs: [run("a", { tokens: 100, outputTokens: 10, toolCalls: 2, durationMs: 1000 })] },
    { runs: [run("b", { tokens: 50, outputTokens: 5, toolCalls: 1, durationMs: 2000 })] },
  ]);
  assert.equal(l.sessions, 2);
  assert.equal(l.runs, 2);
  assert.equal(l.tokens, 150);
  assert.equal(l.outputTokens, 15);
  assert.equal(l.toolCalls, 3);
  assert.equal(l.agentSeconds, 3);
});

/* ---- concurrency: the headline metric, and the easiest to get wrong ---- */

const span = (id, from, to) =>
  run(id, { startedAt: new Date(from).toISOString(), lastActivityAt: new Date(to).toISOString() });

test("fully overlapping runs report full overlap", () => {
  const c = concurrency([span("a", 0, 10_000), span("b", 0, 10_000)]);
  assert.equal(c.peak, 2);
  assert.equal(c.wallMs, 10_000);
  assert.equal(c.overlapMs, 10_000);
});

test("back-to-back runs never count as concurrent", () => {
  // This is the distinction the metric exists for: launched in sequence looks
  // identical to launched in parallel unless overlap is measured.
  //
  // The boundary matters. If A ends exactly as B starts they were never both
  // active, so peak must be 1 — which the sweep gets right by processing end
  // events before start events at equal timestamps.
  const c = concurrency([span("a", 0, 5_000), span("b", 5_000, 10_000)]);
  assert.equal(c.peak, 1);
  assert.equal(c.overlapMs, 0);
  assert.equal(c.wallMs, 10_000);
});

test("partial overlap is measured, not rounded to all or nothing", () => {
  const c = concurrency([span("a", 0, 6_000), span("b", 4_000, 10_000)]);
  assert.equal(c.overlapMs, 2_000);
  assert.equal(c.peak, 2);
});

test("peak reflects the most runs active at once, not the total", () => {
  const c = concurrency([
    span("a", 0, 10_000),
    span("b", 1_000, 9_000),
    span("c", 2_000, 8_000),
    span("d", 20_000, 30_000), // starts after the others end
  ]);
  assert.equal(c.peak, 3);
});

test("a single run has no concurrency", () => {
  const c = concurrency([span("a", 0, 5_000)]);
  assert.equal(c.peak, 1);
  assert.equal(c.overlapMs, 0);
});

test("runs without timestamps are ignored rather than crashing", () => {
  const c = concurrency([run("a"), run("b")]);
  assert.equal(c.peak, 0);
  assert.equal(c.overlapMs, 0);
});
