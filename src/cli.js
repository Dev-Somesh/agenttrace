#!/usr/bin/env node
/**
 * agenttrace — see what your coding agents actually did.
 *
 * Reads agent transcripts already on disk and serves a local page showing what
 * each run cost, when it ran, and which files it touched. Nothing is uploaded
 * and no network calls are made.
 */
import { createServer, buildState } from "./server.js";
import { availableSources } from "./sources/index.js";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

if (has("help") || has("h")) {
  console.log(`
  agenttrace — see what your coding agents actually did

    npx agenttrace                 serve the console for this directory
    npx agenttrace --port 5000     use a different port
    npx agenttrace --dir <path>    inspect another project
    npx agenttrace --json          print the data and exit
    npx agenttrace --sources       list detected agent runners
    npx agenttrace --docs plans    show only these document collections
                                   (default: everything found)

  Reads local transcripts only. Sends nothing anywhere.
`);
  process.exit(0);
}

const cwd = flag("dir", process.cwd());
// Which document collections to surface. Omitted means everything discovered.
const docs = (flag("docs", "") || "").split(",").map((s) => s.trim()).filter(Boolean);

if (has("sources")) {
  const found = availableSources();
  if (!found.length) {
    console.error("No supported agent runners found on this machine.");
    process.exit(1);
  }
  for (const s of found) console.log(`${s.id}\t${s.label}`);
  process.exit(0);
}

if (has("json")) {
  console.log(JSON.stringify(buildState(cwd, { docs }), null, 2));
  process.exit(0);
}

const state = buildState(cwd, { docs });
if (!state.sessions.length) {
  console.error(`No agent runs found for ${cwd}.`);
  console.error(`Detected runners: ${state.sources.map((s) => s.label).join(", ") || "none"}`);
  console.error(`Try --dir <path> if the project lives elsewhere.`);
  process.exit(1);
}

const port = Number(flag("port", 4180));
createServer({ cwd, docs }).listen(port, () => {
  const { runs, sessions, tokens } = state.lifetime;
  console.log(`\n  agenttrace  →  http://localhost:${port}\n`);
  console.log(`  ${runs} runs across ${sessions} sessions · ${tokens.toLocaleString()} tokens`);
  console.log(`  ${cwd}`);
  const collections = state.documents || [];
  if (collections.length) {
    const n = collections.reduce((t, c) => t + c.items.length, 0);
    console.log(`  ${n} documents in ${collections.map((c) => c.label).join(", ")}`);
  }
  console.log(`\n  Local files only. Ctrl+C to stop.\n`);
});
