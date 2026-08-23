import { test } from "node:test";
import assert from "node:assert/strict";
import { consumedTokens, statusFromLastWrite, IDLE_MS } from "../src/sources/types.js";

test("consumedTokens is input + output + cache creation, never cache reads", () => {
  assert.equal(
    consumedTokens({
      input_tokens: 10,
      output_tokens: 4,
      cache_creation_input_tokens: 2,
      cache_read_input_tokens: 5000,
    }),
    16
  );
});

test("consumedTokens treats missing usage as zero rather than crashing", () => {
  assert.equal(consumedTokens(null), 0);
  assert.equal(consumedTokens({}), 0);
});

test("a run quiet for longer than IDLE_MS is finished", () => {
  const now = Date.parse("2026-01-15T12:00:00.000Z");
  const recent = new Date(now - IDLE_MS + 1).toISOString();
  const old = new Date(now - IDLE_MS - 1).toISOString();
  assert.equal(statusFromLastWrite(recent, now), "running");
  assert.equal(statusFromLastWrite(old, now), "finished");
  assert.equal(statusFromLastWrite(null, now), "finished");
});
