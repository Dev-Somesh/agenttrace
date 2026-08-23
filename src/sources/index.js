/**
 * Source registry.
 *
 * To add a runner: write one file in this directory implementing the Source
 * interface in types.js, then add it here. Nothing else in agenttrace needs to
 * change, and nothing outside this directory may reference a vendor.
 */
import { claudeCode } from "./claude-code.js";

export const SOURCES = [claudeCode];

/** Sources actually present on this machine. */
export function availableSources() {
  return SOURCES.filter((s) => {
    try {
      return s.detect();
    } catch {
      return false;
    }
  });
}

/**
 * Every session from every available source, newest first.
 * A broken source is skipped rather than taking the whole run down with it.
 */
export function collectSessions(cwd) {
  const sessions = [];
  const problems = [];
  for (const source of availableSources()) {
    try {
      sessions.push(...source.sessions({ cwd }));
    } catch (err) {
      problems.push(`${source.id}: ${err.message}`);
    }
  }
  sessions.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return { sessions, problems };
}
