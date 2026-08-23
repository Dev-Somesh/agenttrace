# What this tab is

**Docs** lists markdown your agent runner keeps *beside this project* — not
every file on the machine, and not a plan written for some other repo.

Each collection below is a sample of a kind agenttrace will surface when it
finds one in the project. They are shipped with the package so the tab has
something to show on a first run. Your own files replace them the moment a
source finds any.

| Kind | What it usually is |
|---|---|
| Plan | A written approach for a piece of work |
| Skill | Instructions a runner loads for a recurring task |
| Agent | A specialised agent definition |
| Command | A slash-command or prompt snippet |
| Rule | A standing constraint the runner should honour |

## How a document connects to a run

A document is linked to an agent run only when that is **observed**:

1. **Opened** — the run's transcript names the file in a read or write.
2. **Agent type** — the runner recorded the run as that agent (the `kind` on
   the run matches an agent definition). A plan or skill of the same name is
   not treated as that agent.

Nothing is inferred from prompts. If a run was "told" to follow a skill but
never opened the file, there is no edge.

These samples have no such edge: they are not in the project, so no run has
opened them. Your own files pick up links as soon as a transcript touches them.

`--docs plans,skills` narrows what is listed. The tab hides entirely when a
project has no documents and you have filtered the samples away.
