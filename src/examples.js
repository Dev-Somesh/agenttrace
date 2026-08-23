/**
 * Sample documents shipped with the package.
 *
 * Shown only when a project has no sidecar markdown of its own, so a first
 * run still explains the Docs tab — and so a leftover plan from some other
 * repo never appears in its place.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "examples");

const SAMPLES = [
  { id: "about", label: "About", file: "what-this-is.md", name: "What this tab is" },
  { id: "plans", label: "Plans", file: "plan.md", name: "Sample plan" },
  { id: "skills", label: "Skills", file: "skill.md", name: "Sample skill" },
  { id: "agents", label: "Agents", file: "agent.md", name: "Sample agent" },
  { id: "commands", label: "Commands", file: "command.md", name: "Sample command" },
  { id: "rules", label: "Rules", file: "rule.md", name: "Sample rule" },
];

function item(sample) {
  const full = path.join(dir, sample.file);
  const stat = fs.statSync(full);
  return {
    id: `example:${sample.id}:${sample.file}`,
    name: sample.name,
    path: `examples/${sample.file}`,
    updatedAt: new Date(stat.mtimeMs).toISOString(),
    bytes: stat.size,
    markdown: fs.readFileSync(full, "utf8"),
  };
}

/** One collection per kind, so `--docs plans` still matches a sample. */
export function exampleDocuments() {
  return SAMPLES.map((sample) => ({
    id: `example-${sample.id}`,
    label: sample.id === "about" ? sample.label : `${sample.label} (sample)`,
    scope: "example",
    items: [item(sample)],
  }));
}
