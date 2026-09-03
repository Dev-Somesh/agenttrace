import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { filesFromCommand, repoRelative, sameProject } from "../src/sources/read.js";

test("a .json filename is not truncated to .js", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-re-"));
  fs.writeFileSync(path.join(tmp, "package.json"), "{}\n");
  const found = [...filesFromCommand("cat package.json && cat package.js", tmp)];
  assert.deepEqual(found, ["package.json"]);
});

test("an explicit path to a deleted file still counts; a scrape of one does not", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "at-re-"));
  assert.equal(repoRelative(tmp, "src/gone.ts"), "src/gone.ts");
  assert.equal(repoRelative(tmp, "src/gone.ts", true), null);
});

test("a sibling path is not treated as inside the project", () => {
  assert.equal(sameProject("/Users/foo", "/Users/foo"), true);
  assert.equal(sameProject("/Users/foo", "/Users/foo/src"), true);
  assert.equal(sameProject("/Users/foo", "/Users/foo-bar"), false);
  assert.equal(sameProject("/Users/foo", "/Users/elsewhere"), false);
});
