#!/usr/bin/env node
/**
 * agenttrace — see what your coding agents actually did.
 *
 * Reads agent transcripts already on disk and serves a local page showing what
 * each run cost, when it ran, and which files it touched. Nothing is uploaded
 * and no network calls are made.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, buildState } from "./server.js";
import { availableSources } from "./sources/index.js";
import { parseSince } from "./analyse.js";
import { snapshotHtml } from "./export.js";
import { accessInfo, projectName } from "./access.js";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
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
    npx agenttrace --since 24h     only runs active in this window
                                   (1h, 7d, or an ISO date)
    npx agenttrace --export out.html
                                   write a self-contained snapshot and exit
    npx agenttrace --lan           bind all interfaces (phone on the same Wi-Fi)
    npx agenttrace --tunnel        also start ngrok / cloudflared if installed
    npx agenttrace --detach        keep serving after this terminal closes

  Default bind is 127.0.0.1. --lan, --tunnel and Forward port are opt-in:
  transcripts can contain secrets, and anyone who can open a live URL can read them.
  A public tunnel uses a binary already on this machine (ngrok or cloudflared).
  Nothing is bundled and nothing is sent unless you opt in.
`);
  process.exit(0);
}

const cwd = flag("dir", process.cwd());
// Which document collections to surface. Omitted means everything discovered.
const docs = (flag("docs", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const since = flag("since", null);
const port = Number(flag("port", 4180));
const lan = has("lan") || has("tunnel") || has("ngrok");
const wantTunnel = has("tunnel") || has("ngrok");
const here = fileURLToPath(import.meta.url);

if (has("detach") || has("background")) {
  if (has("json") || has("export") || has("sources")) {
    console.error("Cannot combine --detach with --json, --export or --sources.");
    process.exit(1);
  }
  const childArgs = [here, ...argv.filter((a) => a !== "--detach" && a !== "--background")];
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: process.env,
  });
  child.unref();
  const info = accessInfo({ cwd, port, lan });
  if (wantTunnel) console.log(`  public URL will appear on the page once the tunnel starts`);
  console.log(`agenttrace running in background (pid ${child.pid})`);
  printAccess(info);
  console.log(`  Stop from the page or: kill ${child.pid}\n`);
  process.exit(0);
}

if (has("sources")) {
  const found = availableSources();
  if (!found.length) {
    console.error("No supported agent runners found on this machine.");
    process.exit(1);
  }
  for (const s of found) console.log(`${s.id}\t${s.label}`);
  process.exit(0);
}

if (has("since") && parseSince(since) == null) {
  console.error("Invalid --since. Use 1h, 24h, 7d, or an ISO date.");
  process.exit(1);
}

if (has("json")) {
  console.log(JSON.stringify(buildState(cwd, { docs, since }), null, 2));
  process.exit(0);
}

if (has("export")) {
  const dest = flag("export", "agenttrace.html");
  const ui = path.join(path.dirname(here), "ui", "index.html");
  const html = snapshotHtml(fs.readFileSync(ui, "utf8"), buildState(cwd, { docs, since }));
  fs.writeFileSync(dest, html);
  console.log(`Wrote ${dest}`);
  process.exit(0);
}

const state = buildState(cwd, { docs, since });
if (!state.sessions.length) {
  console.error(`No agent runs found for ${cwd}.`);
  console.error(`Detected runners: ${state.sources.map((s) => s.label).join(", ") || "none"}`);
  console.error(`Try --dir <path> if the project lives elsewhere.`);
  process.exit(1);
}

function printAccess(info) {
  const name = info.project || projectName(cwd);
  console.log(`  project   ${name}`);
  for (const u of info.urls) {
    const mark = u.live ? "" : "  (off — Forward port on the page, or --lan)";
    console.log(`  ${u.related.padEnd(22)} ${u.url}${mark}`);
  }
  if (info.urls.length < 2 && !info.lan) {
    console.log(`  no other addresses     this machine has no LAN IP to forward`);
  }
}

const app = createApp({ cwd, docs, since, port, lan, tunnel: wantTunnel });
app.start().then(async (info) => {
  if (wantTunnel) {
    const url = await app.waitTunnel();
    info = app.access();
    if (!url && info.tunnel?.error) console.error(`  tunnel: ${info.tunnel.error}`);
  }
  const { runs, sessions, tokens, costUsd } = state.lifetime;
  console.log(`\n  agenttrace\n`);
  printAccess(info);
  const cost = costUsd == null ? "" : ` · ~$${costUsd.toFixed(2)}`;
  console.log(`\n  ${runs} runs across ${sessions} sessions · ${tokens.toLocaleString()} tokens${cost}`);
  if ((state.across || []).length) {
    const line = state.across
      .map((a) => `${a.sourceLabel}${a.model ? ` · ${a.model}` : " · model not recorded"}`)
      .join("  ·  ");
    console.log(`  ${line}`);
  }
  const collections = state.documents || [];
  if (collections.length) {
    const n = collections.reduce((t, c) => t + c.items.length, 0);
    console.log(`  ${n} documents in ${collections.map((c) => c.label).join(", ")}`);
  }
  if (info.tunnel?.url) {
    console.log(`\n  Public tunnel is live. Stop sharing from the page.\n`);
  } else if (info.lan) {
    console.log(`\n  Shared on the local network. Stop sharing from the page.\n`);
  } else {
    console.log(`\n  Local files only. Ctrl+C to stop, or Stop console on the page.\n`);
  }
}).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
