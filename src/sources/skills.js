/**
 * Where each coding agent reads standing instructions from.
 *
 * This is the only vendor knowledge involved in installing a skill: a path and
 * whatever frontmatter that tool expects. The instructions themselves live in
 * src/skill.js, which names no vendor. It sits in this directory for the same
 * reason every other vendor detail does — nothing outside src/sources/ may
 * reference a specific tool.
 *
 * Being listed here is a weaker claim than being a source. A source means
 * agenttrace can read that runner's transcripts. A target here only means
 * agenttrace can teach that agent to use it — Copilot cannot be measured by
 * this tool, but it can certainly be told to run it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = (...p) => path.join(os.homedir(), ...p);

/** Frontmatter styles, so the shapes are stated once. */
const yaml = (fields) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n\n`;

export const SKILL_TARGETS = [
  {
    id: "claude-code",
    label: "Claude Code",
    file: path.join(".claude", "skills", "agenttrace", "SKILL.md"),
    detect: () => fs.existsSync(home(".claude")),
    wrap: (body, m) => yaml({ name: m.name, description: m.description }) + body,
  },
  {
    id: "cursor",
    label: "Cursor",
    file: path.join(".cursor", "rules", "agenttrace.mdc"),
    detect: () => fs.existsSync(home(".cursor")),
    wrap: (body, m) => yaml({ description: m.description, alwaysApply: false }) + body,
  },
  {
    id: "codex",
    label: "Codex",
    // Codex reads AGENTS.md from the repository root. Everything else here
    // gets its own file; this one would collide with a file the project may
    // already keep, so it is written beside it and linked rather than over it.
    file: path.join(".agents", "agenttrace.md"),
    detect: () => fs.existsSync(home(".codex")),
    wrap: (body) => body,
    note: "AGENTS.md is read automatically; add: See .agents/agenttrace.md for the agenttrace console.",
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    file: path.join(".gemini", "agenttrace.md"),
    detect: () => fs.existsSync(home(".gemini")),
    wrap: (body) => body,
    note: "GEMINI.md is read automatically; add: See .gemini/agenttrace.md for the agenttrace console.",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    file: path.join(".github", "instructions", "agenttrace.instructions.md"),
    detect: (cwd) =>
      fs.existsSync(path.join(cwd, ".github")) || fs.existsSync(home(".config", "github-copilot")),
    wrap: (body, m) => yaml({ description: m.description, applyTo: '"**"' }) + body,
  },
  {
    id: "kiro",
    label: "Kiro",
    file: path.join(".kiro", "steering", "agenttrace.md"),
    detect: () => fs.existsSync(home(".kiro")),
    wrap: (body, m) => yaml({ inclusion: "manual", description: m.description }) + body,
  },
];

/**
 * Targets to write for.
 *
 * By default only agents this machine appears to have, so a project does not
 * collect configuration directories for tools nobody here uses. `all` writes
 * every one, for setting a repository up on someone else's behalf.
 */
export function skillTargets({ all = false, cwd = process.cwd() } = {}) {
  return SKILL_TARGETS.filter((t) => all || t.detect(cwd)).map((t) => ({ ...t }));
}
