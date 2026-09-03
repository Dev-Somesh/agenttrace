import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleDocuments } from "../src/examples.js";
import { collectDocuments } from "../src/sources/index.js";

test("shipped samples cover every kind the Docs tab is for", () => {
  const ids = exampleDocuments().map((c) => c.id);
  assert.deepEqual(ids, [
    "example-about",
    "example-plans",
    "example-skills",
    "example-agents",
    "example-commands",
    "example-rules",
  ]);
  for (const c of exampleDocuments()) {
    assert.equal(c.scope, "example");
    assert.ok(c.items[0].markdown.length > 40);
  }
});

test("a project with no sidecar markdown gets the samples, not another repo's plans", () => {
  const docs = collectDocuments("/tmp/runlanes-no-such-project");
  assert.ok(docs.some((c) => c.id === "example-about"));
  assert.ok(!docs.some((c) => c.scope === "user"));
});
