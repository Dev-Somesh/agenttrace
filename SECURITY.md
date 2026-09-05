# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/Dev-Somesh/runlanes/security/advisories/new),
which keeps the report between us until a fix ships. If that is not available
to you, email <hello@someshbhardwaj.dev>.

Please do not open a public issue for a vulnerability.

Expect an acknowledgement within a few days. This is a small project with one
maintainer, so a fix may take longer than the acknowledgement, and you will be
told either way rather than left waiting.

## Supported versions

The latest release on npm is the supported one. There are no long-lived
branches to backport to, and upgrading is `npx runlanes`.

## What this tool does, so you can judge the surface

runlanes reads agent transcripts that already exist on disk and serves a page
describing them. That shape sets the boundaries of the risk.

- **It makes no outbound network requests.** CI fails the build if a call to
  `fetch`, `axios` or `https.request` appears in server-side code.
- **It binds to `127.0.0.1` by default.** CI fails the build if that stops
  being true, or if a wide bind stops depending on an explicit opt-in.
- **It has no dependencies.** CI fails the build if one is added, so there is
  no transitive tree to audit.
- **It does not modify your repository.** It reads transcripts and checks
  whether paths exist. `--install-skill` writes agent instruction files, and is
  the only thing that writes into a project.
- **It starts a process in exactly two cases**: `--tunnel` runs `ngrok` or
  `cloudflared` if one is already on your `PATH`, and `--detach` re-runs
  runlanes itself. Nothing is bundled and nothing is downloaded.

## In scope

Reports of these are wanted:

- Script execution in the console from content that originated in a transcript.
  Transcripts are attacker-influenced whenever an agent has processed untrusted
  input, so escaping failures matter here.
- Reads outside the transcript directories and the project being inspected,
  including through paths scraped out of a transcript.
- The server listening more widely than the flags asked for.
- An export containing documents, which it is supposed to strip, or `--redact`
  leaving prompt-derived run titles behind.
- `--install-skill` writing outside the project it was pointed at.
- Anything that causes an outbound request, since the tool claims to make none.

## Not vulnerabilities

These are documented behaviour, not flaws:

- **Transcripts contain prompts, file paths and anything typed into a shell,
  including secrets.** The console shows what the transcripts hold. Treat it as
  you would treat the transcripts.
- **A URL you shared is readable by whoever can open it.** `--lan`, `--tunnel`
  and Forward port are opt-in and say what each address reaches. Sharing a live
  URL shares the transcripts.
- **An export carries run titles taken from your prompts, and the paths each
  run touched.** This is stated when the file is written, and `--redact`
  replaces the titles. Attaching an unredacted export somewhere public is a
  choice the tool warns about rather than a defect.
- **Costs are estimates** from a local price table you maintain. They are not
  fetched, and they drift. Wrong money is a documentation bug, not a
  vulnerability.
