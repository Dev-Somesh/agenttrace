# agenttrace

**See what your coding agents actually did.**

Run several agents in parallel and you lose sight of them. Which one burned the
tokens? Did they genuinely run concurrently, or just start together? Did two of
them quietly edit the same file?

`agenttrace` answers that from the transcripts your agent runner already writes
to disk. No instrumentation, no wrapper, no account.

```bash
npx agenttrace
```

Opens a local console at `http://localhost:4180`.

---

## What it shows

**Now** — live runs, token spend, tool calls, and a **parallelism figure**: the
share of elapsed time with more than one run active. Launching four agents
together does not mean they overlapped; this says whether they did.

**Execution timeline** — one lane per run, placed by when it actually ran.
Overlapping bars are real concurrency.

**Shared files** — a bipartite graph linking runs to the files two or more of
them touched. The edges are **observed from the transcripts**, not read from
prompts. A run appears against a file because it opened it, which is a different
claim from "its instructions said it would".

**History** — every session found for the project, with per-session graphs, so
you can see what a run cost weeks later.

**Docs** — plans, skills and agent definitions the runner keeps beside your
project, rendered in place. The tab appears only when there is something to
show, and `--docs plans,skills` narrows it.

## Why the numbers are what they are

**Cache reads are excluded from token totals.** They re-report the entire prompt
on every turn, so summing them across a session counts the same context dozens
of times. Totals are `input + output + cache_creation`.

**Agent time is summed per run**, so it exceeds wall-clock wherever runs
overlapped. The UI says so rather than implying elapsed duration.

**Completion is inferred, not asserted.** Transcripts carry no terminal marker,
so a run quiet for 90 seconds reads as finished. The interface states this.

**Interconnection is per session.** Two runs months apart both reading a shared
config were not collaborating. Within one session, touching the same file means
working the same ground.

## Privacy

Everything is read from local files and rendered locally. **agenttrace makes no
network requests and transmits nothing.** There is no telemetry and no account.

Transcripts can contain prompts, file paths, and anything typed into a shell —
including secrets. Treat the console as you would the transcripts themselves,
and do not expose the port beyond localhost.

## Usage

```bash
npx agenttrace                 # console for the current directory
npx agenttrace --port 5000     # different port
npx agenttrace --dir <path>    # another project
npx agenttrace --json          # print the data and exit
npx agenttrace --sources       # list detected agent runners
npx agenttrace --docs plans    # show only these document collections
```

`--json` makes it scriptable: pipe it into `jq` for cost reporting, or assert on
it in CI.

## Supported runners

| Runner | Status |
|---|---|
| Claude Code | Supported |
| Others | Adapter interface is public — see below |

## Adding a runner

`agenttrace` knows nothing about any specific tool. A **source** discovers runs
and normalises them; everything else works only against those shapes.

To add one, write a file in `src/sources/` implementing the `Source` interface
in `src/sources/types.js` and register it in `src/sources/index.js`. Nothing
outside that directory references a vendor, by design.

A source returns sessions of runs, where a run is:

```js
{ id, name, kind, model, status, tokens, outputTokens,
  toolCalls, turns, startedAt, lastActivityAt, durationMs,
  reads: [...], writes: [...] }
```

If your runner records file operations differently, the only work is mapping
them onto `reads` and `writes`.

## Requirements

Node 18+. No dependencies.

## Licence

MIT © Somesh Bhardwaj
