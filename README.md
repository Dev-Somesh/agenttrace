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

Opens a local console at `http://127.0.0.1:4180` for the project you ran it in.
The page names that project and lists every runner and model that has a session
on it — two tools in two chats, both shown.

---

## What it shows

**Now** — every live session on this project, across runners and models, not
just the newest chat. For each: the session id, what the **main conversation**
itself spent, what it **delegated** to subagents, live context size, tool
calls, and a **parallelism figure** — the share of elapsed time with more than
one run active. Launching four agents
together does not mean they overlapped; this says whether they did.

**Execution timeline** — one lane per run, placed by when it actually ran.
Overlapping bars are real concurrency.

**Shared files** — a bipartite graph linking runs to the files two or more of
them touched. The edges are **observed from the transcripts**, not read from
prompts. A run appears against a file because it opened it, which is a different
claim from "its instructions said it would".

**History** — every session found for the project, with per-session graphs, so
you can see what a run cost weeks later.

**Docs** — plans, skills, agents, commands and rules the runner keeps beside
*this* project, rendered in place. Files from a home-directory pile (other
repos) are not shown. If the project has none, the tab lists short samples so
you can see what it is for. `--docs plans,skills` narrows it.

## Why the numbers are what they are

**Main-session work is counted separately from subagent runs.** Counting only
subagents hides most of the activity in a session where the main agent did the
work itself; summing them hides the split. Both are shown.

**Cache reads are excluded from token totals, but included in cost.** They
re-report the entire prompt on every turn, so summing them across a session
counts the same context dozens of times — the token headline is
`input + output + cache_creation`. They are still billed, at about a tenth of
the input rate on far more tokens, so leaving them out of the dollar figure
understated real spend. Cache writes are billed above the input rate, not at
it. The four classes are priced separately; the headline is unchanged.

**Agent time is summed per run**, so it exceeds wall-clock wherever runs
overlapped. The UI says so rather than implying elapsed duration.

**Dollar figures come from a local price table**, not a live feed. Edit
`src/prices.js` to match what you pay. Every current model needs its own entry:
matching is by longest prefix, so a generic family entry will quietly price a
newer model at an older model's rate. An unlisted model shows no cost rather
than an invented one.

**Completion is inferred, not asserted.** Transcripts carry no terminal marker,
so a run quiet for 90 seconds reads as finished. The interface states this.

**Interconnection is per session.** Two runs months apart both reading a shared
config were not collaborating. Within one session, touching the same file means
working the same ground.

## Privacy

Everything is read from local files and rendered locally. **agenttrace makes no
network requests and transmits nothing.** There is no telemetry and no account.

Transcripts can contain prompts, file paths, and anything typed into a shell —
including secrets. Treat the console as you would the transcripts themselves.

The default bind is **localhost**. Forwarding the port (the button on the page,
`--lan`, or `--tunnel`) is opt-in and lists every address with what it is for:
this machine, Wi-Fi, VPN, and — if `ngrok` or `cloudflared` is already on your
PATH — a public internet URL. Anyone who can open a live URL can read the
transcripts and can stop sharing or stop the console from the same page.
agenttrace does not bundle a tunnel client and does not start one unless you
ask.

## Usage

```bash
npx agenttrace                 # console for the current directory
npx agenttrace --port 5000     # different port
npx agenttrace --dir <path>    # another project
npx agenttrace --json          # print the data and exit
npx agenttrace --sources       # list detected agent runners
npx agenttrace --docs plans    # show only these document collections
npx agenttrace --since 24h     # only runs active in this window
npx agenttrace --export out.html
                               # self-contained snapshot, shareable in a PR
npx agenttrace --lan           # reachable on the same Wi-Fi (opt-in)
npx agenttrace --tunnel        # also start ngrok / cloudflared if installed
npx agenttrace --detach        # keep serving after the terminal closes
```

`--json` makes it scriptable: pipe it into `jq` for cost reporting, or assert on
it in CI.

## Supported runners

| Runner | Status |
|---|---|
| Claude Code | Supported |
| Cursor | Supported — transcripts do not record token usage, so those figures stay 0 |
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
