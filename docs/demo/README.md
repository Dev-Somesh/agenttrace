# Demo

The published demo is the console itself, exported by `runlanes --export` and
served from GitHub Pages. It is not a screenshot and not a mock: the same code
that draws your project draws the page, so a change that breaks the console
breaks the demo.

```bash
node docs/demo/build.mjs site   # writes site/index.html
open site/index.html
```

`generate.mjs` stages a throwaway project and writes transcripts in each
runner's own on-disk format. `build.mjs` runs it, exports the console against
that staged HOME, and marks the result as staged data.

## The runs are invented

Every figure on the page is synthetic. The test fixtures could not do this job —
they are written to make assertions fail loudly, so their timestamps sit months
apart and their runs record no usage, which is correct for a parser test and
unreadable as a demo. These transcripts are the opposite: plausible token
counts, clocks relative to the moment the file is generated, and runners that
deliberately overlap on a few files so the shared-file graph has something to
draw.

That is also why the page says so in its first line. This tool argues that its
numbers survive being checked; a demo passing itself off as a real project would
undercut the argument it exists to make.

## Keeping it honest

Some things are deliberate and worth not "fixing":

- **Cursor, Copilot and Kiro report `—`, not `0`.** Their transcripts record no
  usage. Four of the eight runs are unmeasured and the console says so.
- **Kiro's files are aged with `utimesSync`.** Kiro infers status from write
  recency rather than from a timestamp in the file, so a freshly generated
  session would otherwise claim to still be running.
- **Claude Code's parent did real work and also delegated.** Its `runs` array
  holds only subagents; the parent's own spend is the session total. A demo
  where the parent did nothing would make the split look pointless.
