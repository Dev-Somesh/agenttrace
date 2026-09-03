import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installSkill, SKILL_BODY, SKILL_DESCRIPTION } from "../src/skill.js";
import { SKILL_TARGETS, skillTargets } from "../src/sources/skills.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "at-skill-"));

test("every target writes a file the agent will actually read", () => {
  const dir = tmp();
  const results = installSkill(dir, skillTargets({ all: true, cwd: dir }));

  assert.equal(results.length, SKILL_TARGETS.length, "all targets attempted");
  for (const r of results) {
    const written = path.join(dir, r.file);
    assert.ok(fs.existsSync(written), `${r.label} wrote ${r.file}`);
    const text = fs.readFileSync(written, "utf8");
    assert.ok(text.includes("runlanes"), `${r.label} carries the instructions`);
    assert.equal(r.status, "written");
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a second install keeps what is there rather than overwriting an edit", () => {
  const dir = tmp();
  const targets = skillTargets({ all: true, cwd: dir });
  installSkill(dir, targets);

  const one = path.join(dir, targets[0].file);
  fs.writeFileSync(one, "edited by the user");

  const again = installSkill(dir, targets);
  assert.ok(again.every((r) => r.status === "kept"), "nothing is rewritten by default");
  assert.equal(fs.readFileSync(one, "utf8"), "edited by the user", "an edit survives");

  const forced = installSkill(dir, targets, { force: true });
  assert.ok(forced.every((r) => r.status === "replaced"));
  assert.notEqual(fs.readFileSync(one, "utf8"), "edited by the user");
  fs.rmSync(dir, { recursive: true, force: true });
});

// The instructions exist because agents get these two wrong on their own, and
// getting them wrong means reporting a run as free or reporting no work at all.
test("the skill states the mistakes that make an agent report wrong numbers", () => {
  assert.match(SKILL_BODY, /—.*not.*zero|unmeasured, not free/is, "em dash is not zero");
  assert.match(SKILL_BODY, /--detach/, "tells the agent not to block on a foreground server");
  assert.match(SKILL_BODY, /delegated/i, "explains the conversation/delegated split");
  assert.match(SKILL_BODY, /never pass `--lan` or `--tunnel`/i, "forbids self-directed exposure");
  assert.ok(SKILL_DESCRIPTION.length < 500, "description stays short enough to be loaded");
});

// A skill target is a weaker claim than a source: it says we can teach that
// agent, not that we can read its transcripts. Nothing here may imply support.
test("skill targets are declared in the sources directory, not the app", () => {
  const app = fs.readFileSync(new URL("../src/skill.js", import.meta.url), "utf8");
  for (const vendor of [".claude", ".cursor", ".codex", ".gemini", ".kiro", ".github"]) {
    assert.ok(!app.includes(vendor), `src/skill.js must not name ${vendor}`);
  }
  assert.ok(SKILL_TARGETS.every((t) => t.id && t.label && t.file && t.wrap));
});
