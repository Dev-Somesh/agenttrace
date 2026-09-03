/**
 * A skill file teaching an agent to run and read this tool.
 *
 * People ask their agent to "set up runlanes" and the agent guesses. Left to
 * guess it starts the server in the foreground and blocks until it times out,
 * or reads an unmeasured `—` as zero cost and reports the run as free. The
 * instructions below are the same ones in the README, written once here.
 *
 * Where the file goes, and what frontmatter it needs, differs per runner — so
 * that belongs to the sources, not here. This module knows the words; the
 * adapter knows the filename. Nothing outside src/sources/ names a vendor.
 */
import fs from "node:fs";
import path from "node:path";

export const SKILL_NAME = "runlanes";

export const SKILL_DESCRIPTION =
  "Run the runlanes console for this project and read its figures correctly. " +
  "Use when asked to set up runlanes, show agent cost, check how much a run " +
  "spent, see whether agents ran in parallel, or find which files two runs both touched.";

/** The instructions themselves, free of any runner-specific framing. */
export const SKILL_BODY = `# runlanes

A local, read-only console over the transcripts your coding agents already
wrote to disk. No API key, no account, no configuration. It reads files; it
never sends anything anywhere.

## Starting it

The server runs until stopped, so a foreground call blocks until you time out.
Always use \`--detach\`, which spawns it, prints the URL and pid, and returns:

\`\`\`bash
cd <the user's project>
npx -y runlanes --detach
\`\`\`

Then confirm it is serving before telling the user it is ready:

\`\`\`bash
curl -s http://127.0.0.1:4180/api/state | head -c 200
\`\`\`

Open it on the user's machine — \`open\` on macOS, \`xdg-open\` on Linux,
\`start\` on Windows. If you have no display (remote host, container), give the
user the URL instead. Do not reach for \`--lan\` or \`--tunnel\` to work around
it.

## Reading the numbers correctly

These are the mistakes an agent makes when reporting what it sees.

- **\`—\` is not zero.** A runner that records no token usage shows \`—\`. It
  means unmeasured, not free. Never report such a run as costing nothing.
- **"This conversation" and "delegated" are separate.** The main agent's own
  work is counted apart from what it handed to subagents. Summing only
  subagents misses most of the activity in most sessions.
- **Cache reads are excluded from the token headline but included in cost.**
  They re-report the whole prompt each turn, so counting them inflates tokens —
  but they are billed, so ignoring them understates dollars.
- **Cost is an estimate from a local price table**, not a bill. An unlisted
  model shows no cost rather than a guessed one.
- **"Finished" is inferred** from ninety seconds of quiet, because transcripts
  carry no terminal marker.

## Answering questions without opening a browser

\`--json\` prints everything and exits:

\`\`\`bash
npx -y runlanes --json --since 24h
\`\`\`

Useful fields: \`lifetime.totalTokens\`, \`lifetime.totalCostUsd\`,
\`lifetime.mainTokens\`, \`lifetime.unmeasuredRuns\`, and per session
\`totals\` and \`runs\`.

## When it finds nothing

\`--sources\` lists the runners detected. If the console is empty, the project
has no transcripts — that is the honest answer, not a bug to debug. Do not
fabricate data or point it at a different directory without asking.

## Rules

- Never pass \`--lan\` or \`--tunnel\` unless the user explicitly asks. They
  expose the console beyond the machine, and transcripts contain prompts, file
  paths, and sometimes secrets typed into a shell.
- Never commit anything you create. If you add a \`runlanes.json\` for
  prices, tell the user it exists.
- Do not paste console contents into a public issue or PR without asking.
- A port already in use fails with \`EADDRINUSE\` and does not fall back. Retry
  on another port, or check whether runlanes is already running.
`;

/**
 * Write the skill for each target a source described.
 *
 * An existing file is left alone unless `force`, because it may have been
 * edited. The result says what happened to every target rather than only what
 * changed, so the caller can tell "already there" from "just written".
 */
export function installSkill(cwd, targets, { force = false, io = fs } = {}) {
  const results = [];
  for (const t of targets) {
    const dest = path.join(cwd, t.file);
    const existed = io.existsSync(dest);
    if (existed && !force) {
      results.push({ label: t.label, file: t.file, status: "kept" });
      continue;
    }
    io.mkdirSync(path.dirname(dest), { recursive: true });
    io.writeFileSync(dest, t.wrap(SKILL_BODY, { name: SKILL_NAME, description: SKILL_DESCRIPTION }));
    results.push({ label: t.label, file: t.file, status: existed ? "replaced" : "written" });
  }
  return results;
}
