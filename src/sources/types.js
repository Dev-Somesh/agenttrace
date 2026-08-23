/**
 * The source interface.
 *
 * agenttrace knows nothing about any particular agent runner. A source
 * discovers runs on disk and normalises them into the shapes below; everything
 * else — the server, the timeline, the graph — works only against these.
 *
 * Adding support for a new runner means writing one file in this directory and
 * registering it in index.js. Nothing outside sources/ should ever reference a
 * vendor name or a vendor-specific path.
 *
 * @typedef {object} Source
 * @property {string} id            Short identifier, e.g. "claude-code".
 * @property {string} label         Human name shown in the UI.
 * @property {() => boolean} detect Is this runner present on this machine?
 * @property {(opts: {cwd: string}) => Session[]} sessions
 * @property {((opts: {cwd: string}) => DocumentCollection[])} [documents]
 *   Optional. Markdown a runner keeps alongside a project — plans, skills,
 *   agent definitions. Sources that have no such concept simply omit this.
 *
 * @typedef {object} DocumentCollection
 * @property {string} id
 * @property {string} label
 * @property {string} scope        "project" or "user".
 * @property {Document[]} items
 *
 * @typedef {object} Document
 * @property {string} id
 * @property {string} name
 * @property {string} path         Shown so the reader knows what they are reading.
 * @property {string|null} [rel]   Repo-relative path, when the file is in the project.
 * @property {string|null} updatedAt
 * @property {number} bytes
 * @property {string} markdown
 *
 * @typedef {object} Session
 * @property {string} id
 * @property {string} sourceId
 * @property {string} [sourceLabel]       Filled by the server from the source registry.
 * @property {string|null} startedAt      ISO 8601.
 * @property {string|null} lastActivityAt ISO 8601.
 * @property {Run[]} runs
 * @property {SessionTotals} totals
 *
 * @typedef {object} Run
 *   One agent invocation.
 * @property {string} id
 * @property {string} name            What it was asked to do.
 * @property {string|null} kind       Agent type, if the runner records one.
 * @property {string|null} model
 * @property {string|null} effort
 * @property {"running"|"finished"} status
 * @property {number} tokens          Consumed: input + output + cache creation.
 * @property {number} outputTokens
 * @property {number} toolCalls
 * @property {number} turns
 * @property {string|null} startedAt
 * @property {string|null} lastActivityAt
 * @property {number|null} durationMs
 * @property {string[]} reads         Repo-relative paths.
 * @property {string[]} writes        Repo-relative paths.
 * @property {number|null} depth      Spawn depth, if known.
 *
 * @typedef {object} SessionTotals
 * @property {number} tokens
 * @property {number} outputTokens
 * @property {number} toolCalls
 * @property {number} contextNow      Size of the most recent prompt, if known.
 * @property {string|null} model
 */

/**
 * Tokens genuinely consumed by a turn.
 *
 * Cache reads are deliberately excluded: they re-report the entire prompt on
 * every turn, so summing them across a session counts the same context dozens
 * of times and produces a number several times larger than reality.
 */
export function consumedTokens(usage) {
  if (!usage || typeof usage !== "object") return 0;
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

/**
 * A run is considered finished when it has been quiet for this long.
 *
 * Transcripts carry no terminal marker, so completion is inferred from write
 * recency. This is an inference and the UI says so rather than presenting it
 * as fact.
 */
export const IDLE_MS = 90_000;

export function statusFromLastWrite(lastActivityAt, now = Date.now()) {
  if (!lastActivityAt) return "finished";
  return now - new Date(lastActivityAt).getTime() < IDLE_MS ? "running" : "finished";
}
