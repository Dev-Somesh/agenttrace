/**
 * Analysis over normalised sessions. No vendor knowledge lives here.
 */

/**
 * Files touched by more than one run in the same session.
 *
 * Interconnection is computed per session on purpose: two agents months apart
 * both reading a common config were not collaborating. Within one session,
 * touching the same file means working the same ground.
 */
export function sharedFiles(runs) {
  const touchedBy = new Map();
  for (const run of runs) {
    for (const file of [...run.reads, ...run.writes]) {
      if (!touchedBy.has(file)) touchedBy.set(file, new Set());
      touchedBy.get(file).add(run.id);
    }
  }
  return [...touchedBy.entries()]
    .filter(([, who]) => who.size > 1)
    .map(([file, who]) => ({ file, runs: [...who] }))
    .sort((a, b) => b.runs.length - a.runs.length || a.file.localeCompare(b.file));
}

/** Files only one run touched — that run's own territory. */
export function ownFiles(run, shared) {
  const sharedSet = new Set(shared.map((s) => s.file));
  return run.writes.filter((f) => !sharedSet.has(f));
}

export function lifetime(sessions) {
  const runs = sessions.flatMap((s) => s.runs);
  return {
    sessions: sessions.length,
    runs: runs.length,
    running: runs.filter((r) => r.status === "running").length,
    tokens: runs.reduce((n, r) => n + r.tokens, 0),
    outputTokens: runs.reduce((n, r) => n + r.outputTokens, 0),
    toolCalls: runs.reduce((n, r) => n + r.toolCalls, 0),
    // Summed per run, so it exceeds wall-clock wherever runs overlapped.
    agentSeconds: Math.round(runs.reduce((n, r) => n + (r.durationMs || 0), 0) / 1000),
  };
}

/**
 * How much of the elapsed time had more than one run active.
 *
 * This is the number that says whether parallelism actually happened, as
 * opposed to runs merely being launched together.
 */
export function concurrency(runs) {
  const spans = runs
    .filter((r) => r.startedAt && r.lastActivityAt)
    .map((r) => [+new Date(r.startedAt), +new Date(r.lastActivityAt)]);
  if (spans.length < 2) return { peak: spans.length, overlapMs: 0, wallMs: 0 };

  const events = [];
  for (const [start, end] of spans) {
    events.push([start, 1], [end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let active = 0;
  let peak = 0;
  let overlapMs = 0;
  let prev = events[0][0];
  for (const [at, delta] of events) {
    if (active > 1) overlapMs += at - prev;
    active += delta;
    peak = Math.max(peak, active);
    prev = at;
  }
  const wallMs = Math.max(...spans.map((s) => s[1])) - Math.min(...spans.map((s) => s[0]));
  return { peak, overlapMs, wallMs };
}
