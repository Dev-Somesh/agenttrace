import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { collectSessions, availableSources } from "./sources/index.js";
import { sharedFiles, ownFiles, lifetime, concurrency } from "./analyse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(here, "ui", "index.html");

/**
 * Hash of the served UI.
 *
 * A browser tab keeps whatever script it loaded with, so a page opened before
 * an update runs old code indefinitely with no way to tell. The page compares
 * this against its own build stamp and offers a reload.
 */
function uiVersion() {
  try {
    return createHash("sha1").update(fs.readFileSync(UI)).digest("hex").slice(0, 10);
  } catch {
    return "unknown";
  }
}

export function buildState(cwd) {
  const { sessions, problems } = collectSessions(cwd);

  const enriched = sessions.map((s) => {
    const shared = sharedFiles(s.runs);
    return {
      ...s,
      shared,
      concurrency: concurrency(s.runs),
      runs: s.runs.map((r) => ({ ...r, own: ownFiles(r, shared) })),
    };
  });

  const current = enriched[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    uiVersion: uiVersion(),
    cwd,
    sources: availableSources().map((s) => ({ id: s.id, label: s.label })),
    problems,
    current,
    sessions: enriched,
    lifetime: lifetime(sessions),
  };
}

const send = (res, code, body, type) => {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    // Everything is local; nothing is fetched cross-origin.
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
};

export function createServer({ cwd }) {
  return http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];

    if (url === "/api/state") {
      try {
        return send(res, 200, JSON.stringify(buildState(cwd), null, 2), "application/json");
      } catch (err) {
        return send(res, 500, JSON.stringify({ error: String(err) }), "application/json");
      }
    }

    if (url === "/" || url === "/index.html") {
      try {
        const html = fs.readFileSync(UI, "utf8").replace("__UI_VERSION__", uiVersion());
        return send(res, 200, html, "text/html; charset=utf-8");
      } catch {
        return send(res, 500, "UI missing. Reinstall agenttrace.", "text/plain");
      }
    }

    send(res, 404, "Not found", "text/plain");
  });
}
