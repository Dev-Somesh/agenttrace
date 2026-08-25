# agenttrace

![agenttrace](docs/screenshots/banner.png)

[![CI](https://github.com/Dev-Somesh/agenttrace/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Dev-Somesh/agenttrace/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-3DDC97)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-3DDC97)](package.json)
[![Licence](https://img.shields.io/badge/licence-MIT-38BDF8)](LICENSE)

**See what your coding agents actually did.**

Run several agents in parallel and you lose sight of them. Which one burned the
tokens? Did they genuinely run concurrently, or just start together? Did two of
them quietly edit the same file?

`agenttrace` answers that from the transcripts your agent runner already writes
to disk. No instrumentation, no wrapper, no account.

```bash
npx @dev-somesh/agenttrace
```

Opens a console at `http://127.0.0.1:4180` for the project you ran it in.

> [!NOTE]
> Published as **`@dev-somesh/agenttrace`**. Unrelated projects publish under
> `@agenttrace/*` and `agent-trace`; both sit in the request path and need the
> run started through them. This one reads transcripts the runner already
> wrote, so it works on runs that have already finished.

**[What you get](#what-you-get)** · **[Install](#install)** ·
**[Supported agents](#supported-agents)** · **[Usage](#usage)** ·
**[Configuration](#configuration)** ·
**[How the numbers work](#how-the-numbers-work)** · **[Privacy](#privacy)** ·
**[For coding agents](#for-coding-agents)** ·
**[Adding a runner](#adding-a-runner)**

---

## What you get

Four tabs, shown here on a working project — two runners, six sessions,
fourteen runs, captured from an actual day's work.

### Shared files

A bipartite graph linking runs to the files two or more of them touched.

![Shared files: which runs touched the same file](docs/screenshots/console-shared-files.png)

Edges are **observed from the transcripts**, not read from prompts. A run
appears against a file because it opened it — a different claim from "its
instructions said it would".

### Now

Every live session on this project, across runners and models, not just the
newest chat. Per session: what the **main conversation** spent, what it
**delegated** to subagents, live context size, tool calls, and a **parallelism
figure** — the share of elapsed time with more than one run active. Launching
four agents together does not mean they overlapped; this says whether they did.

![Now tab](docs/screenshots/console-now.png)

The **execution timeline** puts one lane per run, placed by when it actually
ran. Overlapping bars are real concurrency.

### History

Every session found for the project, newest write first, each with its own runs
and shared-file graph — so you can see what a run cost weeks later.

![History tab](docs/screenshots/console-history.png)

### Docs

Plans, skills, agents, commands and rules the runner keeps beside *this*
project, rendered in place. Files from a home-directory pile belonging to other
repos are not shown. If the project has none, the tab lists short samples so you
can see what it is for.

![Docs tab](docs/screenshots/console-docs.png)

<details>
<summary><b>What it looks like with almost nothing to show</b></summary>

<br>

Pointed at a repository with a single run and no subagents, the console says so
rather than inventing activity. A runner that records no token usage reads `—`,
not `0` — unmeasured, not free.

![A project with a single run](docs/screenshots/quiet-now.png)

A graph with nothing shared, a history of one session, and a Docs tab falling
back to shipped samples. Each says what it found rather than rendering blank.

![Graph, nothing shared](docs/screenshots/quiet-graph.png)

![History, one session](docs/screenshots/quiet-history.png)

![Docs, falling back to samples](docs/screenshots/quiet-docs.png)

</details>

---

## Install

**Requirements.** Node 18 or newer. No dependencies, so there is nothing else
to install.

You also need a supported runner that has **already written transcripts** for
the project you point at — agenttrace reads what is on disk, it does not create
it. A fresh machine has nothing to show.

```bash
# run it without installing
cd your-project
npx @dev-somesh/agenttrace

# or install it
npm install -g @dev-somesh/agenttrace
agenttrace

# or run it from a clone — no npm install, the repository is the program
git clone https://github.com/Dev-Somesh/agenttrace.git
cd agenttrace
node src/cli.js --dir /path/to/your-project
```

### Supported agents

Two different things are worth separating. **Measuring** an agent means reading
its transcripts and reporting what it spent. **Teaching** one means installing a
skill so it knows how to run the console — which works even for agents this tool
cannot measure.

| Agent | Measured | Teachable |
|---|---|---|
| **Claude Code** | Yes | Yes |
| **Cursor** | Yes — but its transcripts record no token usage, so those figures read `—` | Yes |
| **Codex** | Not yet | Yes |
| **Gemini CLI** | Not yet | Yes |
| **GitHub Copilot** | Not yet | Yes |
| **Kiro** | Not yet | Yes |
| Anything else | [Add a runner](#adding-a-runner) — the adapter interface is public | `--skill` prints the instructions to paste anywhere |

"Not yet" means exactly that: nobody has written the adapter. The transcripts
are on disk in each case, and a source is one file — see
[adding a runner](#adding-a-runner).

`--sources` lists what it can measure on your machine.
[`--install-skill`](#for-coding-agents) covers what it can teach.

---

## Usage

| Flag | What it does |
|---|---|
| *(none)* | Console for the current directory |
| `--port 5000` | Serve on a different port |
| `--dir <path>` | Point at another project |
| `--json` | Print the data and exit |
| `--sources` | List the runners detected on this machine |
| `--docs plans,skills` | Show only these document collections |
| `--since 24h` | Only runs active in this window |
| `--export out.html` | Self-contained snapshot, shareable in a PR |
| `--detach` | Keep serving after the terminal closes |
| `--install-skill` | Teach the coding agents on this machine to use it (`all` for every one) |
| `--skill` | Print those instructions to stdout |
| `--lan` | Reachable on the same Wi-Fi (opt-in) |
| `--tunnel` | Also start `ngrok` / `cloudflared` if installed (opt-in) |

`--json` makes it scriptable — pipe it into `jq` for cost reporting, or assert
on it in CI:

```bash
npx @dev-somesh/agenttrace --json --since 24h | jq '.lifetime.totalCostUsd'
```

---

## Configuration

Everything is optional. agenttrace runs with no config at all.

**Prices.** Dollar figures come from a local table, never a live feed. Put the
rates you actually pay in an `agenttrace.json` beside your project:

```json
{
  "prices": {
    "claude-opus-5": { "input": 5, "output": 25 },
    "your-private-deployment": { "input": 0, "output": 0 }
  }
}
```

Figures are USD per million tokens. Listed models replace the shipped rate,
unlisted ones keep it, and a model the table has never heard of can be added the
same way. A config that cannot be parsed is reported on the page rather than
ignored.

> [!TIP]
> Every current model needs its own entry. Matching is by longest prefix, so a
> generic family entry will quietly price a newer model at an older model's
> rate. An unlisted model shows no cost rather than an invented one.

Editing `src/prices.js` works too, but under `npx` that file lives in a cache
and your edit is gone on the next run.

---

## How the numbers work

Every figure here is meant to survive being questioned.

**Main-session work is counted separately from subagent runs.** Counting only
subagents hides most of the activity in a session where the main agent did the
work itself; summing them hides the split. Both are shown.

**Cache reads are excluded from token totals, but included in cost.** They
re-report the entire prompt on every turn, so summing them counts the same
context dozens of times — the token headline is `input + output +
cache_creation`. They are still billed, at about a tenth of the input rate on
far more tokens, so leaving them out of the dollar figure understated real
spend. Cache writes are billed above the input rate, not at it. The four
classes are priced separately; the headline is unchanged.

**Agent time is summed per run**, so it exceeds wall-clock wherever runs
overlapped. The interface says so rather than implying elapsed duration.

**Completion is inferred, not asserted.** Transcripts carry no terminal marker,
so a run quiet for 90 seconds reads as finished.

**Interconnection is per session.** Two runs months apart both reading a shared
config were not collaborating. Within one session, touching the same file means
working the same ground.

**Unmeasured is not zero.** A runner that records no usage shows `—`. Those
runs are left out of totals rather than counted as nothing, and the number
excluded is shown beside the total.

---

## Privacy

Everything is read from local files and rendered locally. **agenttrace makes no
network requests and transmits nothing.** There is no telemetry and no account.

> [!WARNING]
> Transcripts can contain prompts, file paths, and anything typed into a shell —
> including secrets. Treat the console as you would the transcripts themselves.

The default bind is **localhost**. Forwarding the port — the button on the page,
`--lan`, or `--tunnel` — is opt-in and lists every address with what it is for:
this machine, Wi-Fi, VPN, and, if `ngrok` or `cloudflared` is already on your
PATH, a public internet URL. Anyone who can open a live URL can read the
transcripts, and can stop sharing from the same page. agenttrace does not bundle
a tunnel client and does not start one unless you ask.

---

## For coding agents

### Install the skill

Teach the agents on your machine to run and read this correctly, once:

```bash
npx @dev-somesh/agenttrace --install-skill        # agents detected here
npx @dev-somesh/agenttrace --install-skill all    # every supported agent
npx @dev-somesh/agenttrace --skill                # print it, paste it anywhere
```

It writes a short instruction file wherever each agent already looks:

| Agent | File |
|---|---|
| Claude Code | `.claude/skills/agenttrace/SKILL.md` |
| Cursor | `.cursor/rules/agenttrace.mdc` |
| Codex | `.agents/agenttrace.md` (referenced from `AGENTS.md`) |
| Gemini CLI | `.gemini/agenttrace.md` (referenced from `GEMINI.md`) |
| GitHub Copilot | `.github/instructions/agenttrace.instructions.md` |
| Kiro | `.kiro/steering/agenttrace.md` |

An existing file is never overwritten. Teachable is a weaker claim than
measured — see [supported agents](#supported-agents).

Then just ask:

> Set up agenttrace for this project and open the dashboard.

### Or paste this without installing anything

> Set up agenttrace for this project and open the dashboard. Follow the
> "For coding agents" section of
> https://github.com/Dev-Somesh/agenttrace

<details>
<summary><b>Instructions for the agent</b> — written to be followed literally</summary>

<br>

You are setting up a read-only local dashboard. It needs no API key, no
account, and no configuration. Do not modify the user's project.

**1. Check the runtime.** `node --version` must be 18 or newer. Do not run
`npm install` — this package has no dependencies.

**2. Start it in the background.** The server runs until stopped, so a
foreground call will block you until you time out. `--detach` spawns it, prints
the URL and pid, and returns immediately:

```bash
cd /path/to/the/users/project
npx -y @dev-somesh/agenttrace --detach
```

```
agenttrace running in background (pid 13988)
  project   your-project
  this machine only      http://127.0.0.1:4180
  Stop from the page or: kill 13988
```

**3. Confirm it is serving** before telling the user it is ready:

```bash
curl -s http://127.0.0.1:4180/api/state | head -c 200
```

**4. Open the dashboard on the user's machine.**

```bash
open http://127.0.0.1:4180        # macOS
xdg-open http://127.0.0.1:4180    # Linux
start http://127.0.0.1:4180       # Windows
```

If you cannot open a browser — remote host, container, no display — say so and
give the user the URL. Do not use `--lan` or `--tunnel` to work around it.

**5. Report what it found.** `--sources` lists the runners detected. If it
prints nothing, the machine has no supported transcripts and the dashboard will
be empty. That is not a failure to debug; tell the user rather than trying to
generate data.

### When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `listen EADDRINUSE: ... 127.0.0.1:4180` | Something already holds the port. There is no automatic fallback. | Retry with `--port 4181`, or check whether agenttrace is already running and just open it |
| Dashboard loads, every panel empty | No transcripts for this directory | Run `--sources`. Confirm the user has run a supported agent **in this project** |
| Tokens show `—` | That runner records no usage | Correct behaviour, not a bug. `—` means unmeasured; `0` would mean free |
| Red "running old code" banner | The server started before the files changed | Restart the process. Reloading the page will not help |

### Constraints — do not violate these

- **Never pass `--lan` or `--tunnel` unless the user explicitly asks.** They
  expose the console beyond the machine, and transcripts contain secrets.
- **Never commit anything you create here.** If you add an `agenttrace.json`,
  tell the user it exists.
- **Do not paste dashboard contents into a public issue or PR** without asking.
  The `--export` snapshot strips documents for this reason.

### If you cannot open a browser at all

Skip the server — `--json` prints everything and exits:

```bash
npx -y @dev-somesh/agenttrace --json --since 24h
```

</details>

---

## Adding a runner

`agenttrace` knows nothing about any specific tool. A **source** discovers runs
and normalises them; everything else works only against those shapes. Nothing
outside `src/sources/` references a vendor, and CI fails the build if that
changes.

To add one, write a file in `src/sources/` implementing the `Source` interface
in `src/sources/types.js` and register it in `src/sources/index.js`. A source
returns sessions of runs, where a run is:

```js
{ id, name, kind, model, status, tokens, outputTokens,
  toolCalls, turns, startedAt, lastActivityAt, durationMs,
  reads: [...], writes: [...] }
```

If your runner records file operations differently, the only work is mapping
them onto `reads` and `writes`.

---

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the architecture, how to run the
tests, and the decisions behind the parts of this codebase that look odd on
purpose — why cache reads are excluded from token counts but included in cost,
why an unlisted model reports no price rather than a guessed one, and why the
adapter boundary is enforced by CI.

## Author

**Somesh Bhardwaj** — [someshbhardwaj.dev](https://someshbhardwaj.dev) ·
[LinkedIn](https://www.linkedin.com/in/ersomeshbhardwaj/) ·
[GitHub](https://github.com/Dev-Somesh)

## Licence

MIT © [Somesh Bhardwaj](https://someshbhardwaj.dev)
