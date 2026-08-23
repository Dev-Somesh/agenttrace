# Handoff

For an agent or developer picking `agenttrace` up cold, in a fresh session.
Read this before changing anything.

---

## What this is

A local console that reads coding-agent transcripts already on disk and shows
what each run cost, when it ran, and which files it touched. Extracted from a
tool built during a portfolio rebuild where eight agents ran across two
sessions and there was no way to see what any of them were doing.

**It is an instrument, not a dashboard.** Its value is that every number is
measured from a transcript rather than reported by the agent that produced it.
Preserve that. If a feature would require trusting an agent's own account of
its work, it does not belong here.

## Run it

```bash
node src/cli.js            # console on :4180
node src/cli.js --json     # data, no server
node src/cli.js --sources  # detected runners
```

No dependencies. Node 18+.

## Architecture

```
src/
  cli.js              argument parsing, startup checks
  server.js           HTTP, /api/state, UI version stamping
  analyse.js          sharedFiles, ownFiles, lifetime, concurrency
  sources/
    types.js          the Source interface + token accounting
    claude-code.js    first implementation (sessions + documents)
    index.js          registry
  ui/index.html       single-file UI, no build step
```

**The one architectural rule:** nothing outside `src/sources/` may reference a
vendor. `analyse.js`, `server.js` and the UI work only against the normalised
`Session` and `Run` shapes in `types.js`. If you find yourself writing
`.claude` anywhere else, the abstraction has leaked.

## Decisions already made — do not silently reverse these

**Cache reads are excluded from token totals.** They re-report the whole prompt
each turn; summing them counts the same context dozens of times. An early
version did, and reported 382% of a token budget. Totals are
`input + output + cache_creation`.

**Existence checks apply only to scraped paths.** Paths a tool named explicitly
(`file_path`) are always real. Paths pulled out of shell commands by regex can
be invented — a truncated `package.json` produced `package.js` — so those are
checked against disk. Applying the check to *both* silently erased every file
since deleted, which destroyed exactly the history the tool exists to record.

**Interconnection is computed per session.** Two runs months apart both reading
a shared config were not collaborating.

**Status is inferred from write recency** (90s quiet = finished) because
transcripts carry no terminal marker. The UI says so. Do not present it as
fact.

**The main session is measured, not just its subagents.** An early version only
counted subagent runs and skipped any session that had none. That hid most of
the activity in a normal conversation: on the session that motivated this fix,
subagents accounted for 2.1M tokens while the conversation driving them
accounted for 8.3M. They are reported separately — "this conversation" versus
"delegated" — because summing them hides the split, and showing only one hides
the work. Sessions with no subagents are kept.

**Documents are an optional source capability, not a feature of the app.** A
source may implement `documents({cwd})` and return collections of markdown a
runner keeps beside a project — Claude Code returns plans, skills, agents and
commands from both `.claude/` and `~/.claude/`. Two rules hold it together: a
source that has no such concept simply omits the method, and only directories
that exist *and contain files* are returned, so an empty install shows nothing
rather than four empty headings. The Docs tab hides itself when there is
nothing to show. `--docs plans,skills` filters what surfaces.

This is the shape any "show me X from my project" request should take. The
temptation is to read a path directly from the server or the UI; that breaks
the boundary the CI now enforces.

**Render failures must not read as connection failures.** An early version
wrapped fetch and every renderer in one `try/catch`, so a drawing bug reported
"is the server running?" and sent people to restart a healthy process. Keep
network and render errors separate.

**The UI stamps its own build hash** and compares it against the server's on
every poll, showing a reload banner when they differ. A tab keeps the script it
loaded with forever; without this a stale page is indistinguishable from a
working one. This was reported as "not updating" three times before the cause
was found.

## What to build next, roughly in order

1. ~~**Tests.**~~ Done for `analyse.js` — 12 tests, run by CI on Node 18/20/22.
   Writing them immediately caught a wrong assumption: back-to-back runs must
   report `peak: 1`, not 2, because a run ending exactly as another starts was
   never concurrent. The sweep already handled it; the test author did not.
   **Still untested:** the transcript parsing in `claude-code.js`, which needs
   fixture `.jsonl` files.

2. **A second source.** The interface is only proven by one implementation.
   Cursor, Aider, or OpenAI Codex CLI would each validate or break the shape.
   Expect `filesTouched` to be the awkward part.

3. **Document search.** With plans, skills and agent definitions in one place,
   a filter across them is the obvious next step. Keep it client-side — the
   payload is already loaded.

4. **Cost, not just tokens.** A per-model price table turns token counts into
   money, which is what most people actually want. Keep prices in one file and
   be explicit they are user-maintained rather than fetched.

5. **`--since` / `--json` filters** so it can be used in CI to assert a run
   stayed within budget.

6. **Export.** A single self-contained HTML file for a run, shareable in a PR.

## Things to be careful about

**Privacy is the product's reputation.** It reads local files and makes no
network requests. Any feature that would send data anywhere needs to be opt-in,
obvious, and documented. Do not add telemetry.

**Transcripts contain secrets.** Shell commands in them may include tokens and
keys. Never render raw command text in the UI without thinking about that. The
current UI deliberately shows file paths, not commands.

**Performance.** History parses every session on disk and the UI polls every 4
seconds. Parsed transcripts are cached and invalidated on mtime. Preserve that
or the tool will re-parse tens of megabytes a minute.

## CI enforces four claims

`.github/workflows/ci.yml` runs the tests on Node 18/20/22 and then checks the
things this project actually promises, rather than generic hygiene:

- **Zero runtime dependencies.** A dependency should arrive deliberately.
- **No vendor name outside `src/sources/`.** The boundary is the product.
- **No outbound network calls anywhere in `src/`.** "Reads local files and
  sends nothing" is the reputation, not a preference.
- **The CLI answers `--help` with no runner installed**, which is the state a
  first-time user is in.

GitHub will suggest Webpack, Deno and SLSA workflows for this repo. Ignore
them: there is no build step, the runtime is Node, and nothing is published. If
you do publish, npm's built-in `--provenance` is simpler than the generic SLSA
generator.

## Origin

Built 2026-08-22/23 alongside a portfolio rebuild. The first thing it surfaced
was a *parallel session* running two agents that would otherwise have gone
unnoticed — which is a fair summary of why it exists.

It began as `tools/agent-dashboard/` inside that portfolio repo. That copy has
been deleted: two implementations of the same tool means every fix is made
twice and they drift. This repo is the only one.
