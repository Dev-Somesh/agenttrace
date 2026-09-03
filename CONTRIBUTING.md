# Contributing to runlanes

The repository is the program. There is no build step, no bundler, and no
dependencies — `src/cli.js` is what runs.

## Working on it

```bash
git clone https://github.com/Dev-Somesh/runlanes.git
cd runlanes
node src/cli.js                 # console for this repo
node src/cli.js --dir ~/other   # point it at a project with real sessions
npm test                        # 78 tests, no install needed
```

`npm install` is not required and installs nothing: the `dependencies` object is
empty and CI fails if that changes.

To see anything interesting you need a supported runner that has already written
transcripts for the project you point at. `node src/cli.js --sources` lists what
it found on this machine.

## Architecture

```
src/
  cli.js              argument parsing, startup, --lan / --detach
  server.js           HTTP, /api/state, /api/export, /api/lan, /api/stop
  access.js           project name + local/LAN/VPN/public URLs (no network calls)
  tunnel.js           optional ngrok/cloudflared spawn; URL parsed from stdout
  analyse.js          sharedFiles, ownFiles, lifetime, concurrency, --since,
                      nowSessions (every live runner, not only the newest)
  prices.js           local per-model USD table; nothing is fetched
  export.js           self-contained HTML snapshot
  examples.js         shipped sample docs when a project has none
  examples/           the sample markdown
  sources/
    types.js          the Source interface + token accounting
    read.js           jsonl + path hygiene (existence checks on scrapes only)
    claude-code.js    sessions + documents
    cursor.js         sessions + documents (no token usage in transcripts)
    index.js          registry
  ui/index.html       single-file UI, no build step
```

**The one architectural rule:** nothing outside `src/sources/` may reference a
vendor. `analyse.js`, `server.js` and the UI work only against the normalised
`Session` and `Run` shapes in `types.js`. If you find yourself writing
`.claude` anywhere else, the abstraction has leaked.

## Adding a skill target

A **source** is a runner whose transcripts we can read. A **skill target** is an
agent we can hand instructions to. They are different claims and different
files, and conflating them would advertise support that does not exist —
Copilot cannot be measured by this tool and can still be told to run it.

Skill targets live in `src/sources/skills.js`, with every other piece of vendor
knowledge. A target is a path, a `detect()`, and a `wrap()` that adds whatever
frontmatter that tool expects:

```js
{
  id: "some-agent",
  label: "Some Agent",
  file: path.join(".someagent", "rules", "runlanes.md"),
  detect: (cwd) => fs.existsSync(home(".someagent")),
  wrap: (body, m) => yaml({ description: m.description }) + body,
}
```

The instructions themselves are in `src/skill.js` and name no vendor. That
split is not stylistic: the first version of this feature put `.claude` and
`.cursor` in `src/skill.js` and would have failed the adapter-boundary check.
A test asserts that file mentions no tool.

`detect()` decides whether `--install-skill` writes for that agent by default,
so a project does not accumulate configuration directories for tools nobody
uses. `--install-skill all` ignores detection.

## Decisions already made — do not silently reverse these

**Cache reads are excluded from token totals — and included in cost.** They
re-report the whole prompt each turn; summing them counts the same context
dozens of times. An early version did, and reported 382% of a token budget.
The token headline is `input + output + cache_creation` and stays that way.

Cost is a different question, and answering it with that same number was
wrong. Cache reads are billed. On this project's own session the headline was
505k tokens against **21.2M cache reads**: pricing them at zero left roughly
two thirds of real spend invisible. The four token classes are now priced
separately — cache writes at 1.25x input, cache reads at 0.1x — while the
headline is untouched. Do not "simplify" that back into one number; they
answer different questions.

**Every current model needs its own entry in `src/prices.js`.** Matching is by
longest prefix. A generic `claude-opus` entry priced `claude-opus-5` at the
older family's rate — three times too high. Combined with unpriced cache
reads, the two errors nearly cancelled: the total looked plausible while both
halves were badly wrong, which is why neither was noticed. An unlisted model
must report no cost at all; a blank prompts someone to check, a wrong number
does not. There is a test holding this.

**README screenshots use relative paths, which npm will not render.** They
resolve on GitHub and are excluded from the published tarball by the `files`
array, so the package stays ~43 kB. npmjs.com does not resolve relative image
paths: before publishing, swap them for absolute
`raw.githubusercontent.com/Dev-Somesh/runlanes/main/...` URLs, which work in
both places — but only once the repo is public, since raw URLs on a private
repo need a token and would render broken.

The screenshots are of real transcripts from a real project. They show file
paths and truncated prompts. Regenerating them against a fixture project is the
way to remove that if these ever go somewhere more public than the repo.

**Reader-supplied prices live in `runlanes.json`, not in `src/prices.js`.**
The README used to say to edit `src/prices.js`. Under `npx` that file sits in a
node_modules cache, so the single documented modification of this tool was
discarded on the next run — and quietly, leaving every dollar figure wrong. A
`prices` block in the project's own `runlanes.json` is merged over the
shipped table at load. A config that cannot be parsed is pushed to `problems`
and shown, never swallowed: wrong money with a console reporting itself healthy
is the failure mode this whole tool exists to catch.

**The test glob in package.json is unquoted on purpose.** `node --test
'test/*.test.js'` hides the pattern from the shell, and Node only expands globs
itself from v21 — so on Node 18 and 20 it matched nothing, exited 1, and the CI
matrix failed on every commit from the one that introduced it. It looked fine
locally because the dev machine runs Node 23. Unquoted, the shell expands it to
explicit paths, which every supported version accepts. Do not add the quotes
back; if a shell ever needs them, list the files instead. (The bare directory
form `node --test test/` is the other trap — it fails on Node 23.)

**Existence checks apply only to scraped paths.** Paths a tool named explicitly
(`file_path`) are always real. Paths pulled out of shell commands by regex can
be invented — a truncated `package.json` produced `package.js` — so those are
checked against disk. Applying the check to *both* silently erased every file
since deleted, which destroyed exactly the history the tool exists to record.
The scrape regex now requires a word boundary after the extension so
`package.json` is not itself truncated to `package.js`.

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
runner keeps *beside this project*. User-global folders are ignored: they mix
every repo on the machine, and a plan written for something else must not
appear here. Two rules hold it together: a source that has no such concept
simply omits the method, and only directories that exist *and contain files*
are returned. When a project has nothing, the package ships a short sample of
each kind (plan, skill, agent, command, rule) so the tab explains itself.
`--docs plans,skills` filters what surfaces.

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

## Things to be careful about

**Privacy is the product's reputation.** It reads local files and makes no
network requests. Any feature that would send data anywhere needs to be opt-in,
obvious, and documented. Do not add telemetry. A public tunnel is opt-in only:
spawn a binary already on PATH (`ngrok` or `cloudflared`), parse the URL from
its stdout, never bundle a client, never call its HTTP API (CI forbids
`http.request` in `src/**/*.js`). Default bind is `127.0.0.1`. The page lists
every URL with what it is related to (this machine / Wi-Fi / VPN / public).
The same page can stop sharing or stop the process.

**Now is every live runner on the project.** Two sessions from two tools, or
two models, must both appear. Do not collapse the view to `sessions[0]`.

**Transcripts contain secrets.** Shell commands in them may include tokens and
keys. Never render raw command text in the UI without thinking about that. The
current UI deliberately shows file paths, not commands.

**Performance.** History parses every session on disk and the UI polls every 4
seconds. Parsed transcripts are cached and invalidated on mtime. Preserve that
or the tool will re-parse tens of megabytes a minute.

## Read the badge, not just the local run

The README carries a CI badge. Branch protection was attempted and is NOT in
place — GitHub requires Pro for protected branches on a private repo, so the
badge is the only signal. If this repo goes public, add required status checks
on `main` for Node 18/20/22; until then a red run only shows on the badge.

It exists because of a real failure: the CI matrix was added in dea6350
and did not pass once until 7a5d991 — five consecutive red runs — while every
report said green, because `npm test` succeeded locally on Node 23.

A gate nobody reads is not a gate. The badge makes red visible on the repo
page. Do not remove it to unblock a push — fix the run.

**Staleness has two forms and needs two messages.** The build hash is derived
by walking `src/` — do not replace it with a list. It was a list once, naming
six files while eight went uncovered, which reproduced the exact bug it was
written to fix. `prices.js` was the worst omission: the README tells the reader
to edit it, so the one documented user modification was the one change
staleness could not see, and it silently changes every dollar figure shown.

The hash covers the UI *and* every source file, because hashing the UI alone
left a blind spot: a
process started before a fix keeps serving stale logic while the UI hash still
matches, so the page looks healthy and reports wrong data. That happened — a
console ran 29 minutes past a landed fix and nothing indicated it. `serverStale`
in the payload compares the build on disk against the one the process booted
with, and the page says "restart the server" rather than "reload", because
reloading cannot fix it. The banner does still mention reloading — as a
negation, since it is the reader's instinct — and a test enforces that
distinction: `reload` may appear only near a negation, never as an instruction.

**The UI is tested by rendering it.** `test/ui.test.js` runs the page script
against a permissive Proxy-based DOM stub and calls `draw()` with a real
`buildState()` payload. It exists because a merge left `cur` referenced after
the variable had been refactored away, and the console rendered nothing — no
runs, no history, no graph, no Docs tab — while the API returned all of it
correctly and 67 tests stayed green. Every test checked data; none checked that
the page could draw it.

The stub is deliberately permissive so the test fails on real script errors
rather than on whichever DOM method the UI uses next. When adding to it, verify
it fails for the right reason: reintroduce the fault and watch it go red.

**Assert what must be absent, not only what is present.** Both tests here were
weak in the same way at first. One checked that three filenames appeared in the
build list, which passed happily while `prices.js` was missing — it pinned an
incomplete list instead of guarding completeness; it now asserts that editing a
file actually moves the hash. The other checked "restart" was present, so
"reload the page, or restart it" would have passed. A test that only confirms
the good case cannot fail for the reason you wrote it.

## What CI enforces

`.github/workflows/ci.yml` runs the tests on Node 18/20/22 and then checks the
things this project actually promises, rather than generic hygiene:

- **Zero runtime dependencies.** A dependency should arrive deliberately.
- **No vendor name outside `src/sources/`.** The boundary is the product.
- **No outbound network calls anywhere in `src/`.** "Reads local files and
  sends nothing" is the reputation, not a preference.
- **The CLI answers `--help` with no runner installed**, which is the state a
  first-time user is in.
- **The default bind stays loopback.** Added after the network check above was
  found not to cover the risk any more: exposure now happens by spawning
  `ngrok`, which no regex for `fetch` can see. It asserts `server.js` still
  names `127.0.0.1`, that no unconditional wide bind exists, and runs the test
  that holds it — behaviour rather than syntax.

GitHub will suggest Webpack, Deno and SLSA workflows for this repo. Ignore
them: there is no build step and the runtime is Node. For publishing, npm's
built-in `--provenance` is simpler than the generic SLSA generator.
