/**
 * A frozen, self-contained HTML snapshot of a state payload.
 *
 * The live page polls. A snapshot must not: it is a file someone can attach
 * to a PR. The UI already knows how to draw from an injected `__SNAPSHOT__`.
 */

/**
 * The places a state payload keeps session objects, and so the places a run
 * title can be found. `sessions` is the history, `now` is what is live, and
 * `current` is the session doing the work — the same run appears in more than
 * one of them, which is why redaction is keyed by run id rather than by
 * position. Miss one of these and a prompt survives a redacted export.
 */
const SESSION_FIELDS = ["sessions", "now", "current"];

const sessionsIn = (state, field) => {
  const v = state[field];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

/**
 * Replace prompt-derived run titles with `Run 1`, `Run 2`, …
 *
 * A run is titled with the prompt that started it, word for word. It is the
 * one field in a snapshot that can name a client, an incident or an unreleased
 * feature; everything else is a count, a timestamp, a model name or a path.
 * Those stay, because they are what the file exists to show.
 */
export function redactState(state) {
  const label = new Map();
  for (const field of SESSION_FIELDS)
    for (const session of sessionsIn(state, field))
      for (const run of session.runs || [])
        if (run && run.id != null && !label.has(run.id)) label.set(run.id, `Run ${label.size + 1}`);

  let anonymous = 0;
  const redactSession = (session) => ({
    ...session,
    runs: (session.runs || []).map((run) => ({
      ...run,
      name: (run && run.id != null && label.get(run.id)) || `Run ${label.size + ++anonymous}`,
    })),
  });

  const out = { ...state };
  for (const field of SESSION_FIELDS) {
    if (!state[field]) continue;
    out[field] = Array.isArray(state[field])
      ? state[field].map(redactSession)
      : redactSession(state[field]);
  }
  return out;
}

/** Kept for callers that only hold a list of sessions. */
export function redactRuns(sessions) {
  return redactState({ sessions }).sessions;
}

/** How many distinct run titles a snapshot of this state would carry. */
export function promptTitleCount(state) {
  const seen = new Set();
  for (const field of SESSION_FIELDS)
    for (const session of sessionsIn(state, field))
      for (const run of session.runs || []) seen.add(run && run.id != null ? run.id : Symbol());
  return seen.size;
}

/**
 * @param {string} uiTemplate
 * @param {object} state
 * @param {{ redact?: boolean }} [options] replace run titles so the file can
 *   be read by people who are not on the project.
 */
export function snapshotHtml(uiTemplate, state, { redact = false } = {}) {
  // A PR attachment is about the runs. Documents — plans and skills, whether
  // scoped to the project or to a home directory — do not belong in a file
  // someone will upload.
  const safe = { ...(redact ? redactState(state) : state), documents: [] };
  const payload = JSON.stringify(safe).replace(/</g, "\\u003c");
  return uiTemplate.replace(
    "<script>",
    `<script>window.__SNAPSHOT__=${payload};</script>\n<script>`
  );
}
