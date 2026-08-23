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
 * Documents from every source that offers them.
 *
 * Optional by design: a source with no such concept omits `documents`, and the
 * UI hides the tab entirely rather than showing empty headings.
 *
 * `only` filters by collection id, so a project can choose what it surfaces.
 */
export function collectDocuments(cwd, only = null) {
  const out = [];
  for (const source of availableSources()) {
    if (typeof source.documents !== "function") continue;
    try {
      out.push(...source.documents({ cwd }));
    } catch {
      /* a broken source must not take the rest down */
    }
  }
  if (!only || !only.length) return out;
  const wanted = new Set(only.map((s) => s.toLowerCase()));
  return out.filter(
    (c) => wanted.has(c.id.toLowerCase()) || wanted.has(c.id.split("-").pop().toLowerCase())
  );
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
