# Sample command — /budget

A command is a reusable prompt you invoke by name. agenttrace shows the text
so a `/budget` in the history is not an opaque token.

```
Sum tokens for this session from the transcripts on disk.
Exclude cache reads. If a model has no price in the local table, say so
instead of inventing one. Reply with: runs, tokens, estimated cost.
```

Invoke it when you want a number you can paste into a PR, not a narrative.
