/**
 * Source registry.
 *
 * To add a runner: write one file in this directory implementing the Source
 * interface in types.js, then add it here. Nothing else in agenttrace needs to
 * change, and nothing outside this directory may reference a vendor.
 */
import { claudeCode } from "./claude-code.js";
import { cursor } from "./cursor.js";
import { exampleDocuments } from "../examples.js";

export const SOURCES = [claudeCode, cursor];

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
  // A project with no sidecar markdown still gets the shipped samples, so
  // the tab explains itself instead of showing another repo's leftover plan.
  if (!out.length) out.push(...exampleDocuments());
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
  // By last write, not by start. A session that began yesterday and is still
  // being written to is more recent than one opened an hour ago and abandoned;
  // ordering by start pushed the active session down the page and made History
  // look like it had stopped recording.
  const recency = (x) => String(x.lastActivityAt || x.startedAt || "");
  sessions.sort((a, b) => recency(b).localeCompare(recency(a)));
  return { sessions, problems };
}
