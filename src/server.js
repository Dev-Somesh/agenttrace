import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { collectSessions, collectDocuments, availableSources } from "./sources/index.js";
import {
  sharedFiles,
  ownFiles,
  lifetime,
  concurrency,
  parseSince,
  filterSessions,
  linkDocs,
  nowSessions,
  modelsInPlay,
} from "./analyse.js";
import { estimateCostUsd } from "./prices.js";
import { snapshotHtml } from "./export.js";
import { accessInfo, projectName } from "./access.js";
import { startTunnel } from "./tunnel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(here, "ui", "index.html");

/**
 * Hash of the running build — UI *and* server sources.
 *
 * A browser tab keeps whatever script it loaded with, so a page opened before
 * an update runs old code indefinitely with no way to tell. The page compares
 * this against its own build stamp and offers a reload.
 *
 * The server files are included because hashing the UI alone left a blind
 * spot: a long-running process started before a fix keeps serving stale logic
 * while the UI hash still matches, so the page looks entirely healthy and
 * reports wrong data. That happened — a console ran for 29 minutes past a fix
 * that had already landed, and nothing indicated it.
 *
 * This makes the mismatch visible in the browser. It cannot restart the
 * process, so the message says to restart the server, not to reload the page.
 */
const BUILD_FILES = [
  UI,
  path.join(here, "server.js"),
  path.join(here, "analyse.js"),
  path.join(here, "sources", "index.js"),
  path.join(here, "sources", "claude-code.js"),
  path.join(here, "sources", "types.js"),
];

function uiVersion() {
  const hash = createHash("sha1");
  for (const file of BUILD_FILES) {
    try {
      hash.update(fs.readFileSync(file));
    } catch {
      hash.update(`missing:${file}`);
    }
  }
  return hash.digest("hex").slice(0, 10);
}

/**
 * The build on disk right now, versus the one this process started with.
 * They differ when the source changed after the server booted.
 */
const STARTED_WITH = uiVersion();
export const buildDrifted = () => uiVersion() !== STARTED_WITH;

export function buildState(cwd, { docs = null, since = null, access = null } = {}) {
  const { sessions: found, problems } = collectSessions(cwd);
  const sinceMs = parseSince(since);
  const sessions = filterSessions(found, sinceMs);
  const labels = new Map(availableSources().map((s) => [s.id, s.label]));

  const enriched = sessions.map((s) => {
    const shared = sharedFiles(s.runs);
    const sourceLabel = labels.get(s.sourceId) || s.sourceId;
    const totals = s.totals || {};
    return {
      ...s,
      sourceLabel,
      shared,
      concurrency: concurrency(s.runs),
      // The main conversation is priced too. Pricing only the runs reported
      // the cost of what a session delegated and none of what it did itself.
      totals: {
        ...totals,
        costUsd: estimateCostUsd(totals.tokens, totals.outputTokens, totals.model, {
          write: totals.cacheWriteTokens,
          read: totals.cacheReadTokens,
        }),
      },
      runs: s.runs.map((r) => ({
        ...r,
        sourceId: s.sourceId,
        sourceLabel,
        own: ownFiles(r, shared),
        costUsd: estimateCostUsd(r.tokens, r.outputTokens, r.model, {
          write: r.cacheWriteTokens,
          read: r.cacheReadTokens,
        }),
      })),
    };
  });

  const documents = collectDocuments(cwd, docs);
  const allRuns = enriched.flatMap((s) => s.runs);
  const { byRun, byDoc } = linkDocs(allRuns, documents);

  const linked = enriched.map((s) => ({
    ...s,
    runs: s.runs.map((r) => ({ ...r, docs: byRun.get(r.id) || [] })),
  }));

  const now = nowSessions(linked);
  const nowRuns = now.flatMap((s) => s.runs);
  const current = linked[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    uiVersion: uiVersion(),
    // True when the source changed after this process started — the page can
    // then say "restart the server", which reloading will never fix.
    serverStale: buildDrifted(),
    cwd,
    project: projectName(cwd),
    since: since || null,
    sources: availableSources().map((s) => ({ id: s.id, label: s.label })),
    problems,
    current,
    now,
    across: modelsInPlay(now),
    nowShared: sharedFiles(nowRuns),
    nowConcurrency: concurrency(nowRuns),
    sessions: linked,
    lifetime: lifetime(linked),
    documents: documents.map((c) => ({
      ...c,
      items: c.items.map((it) => ({ ...it, usedBy: byDoc.get(it.id) || [] })),
    })),
    access: access || { ...accessInfo({ cwd, port: null, lan: false }), project: projectName(cwd) },
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

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        req.destroy();
        resolve({});
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function listenOn(server, port, host) {
  return new Promise((resolve, reject) => {
    const onErr = (err) => reject(err);
    server.once("error", onErr);
    server.listen(port, host, () => {
      server.off("error", onErr);
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) return resolve();
    server.close(() => resolve());
  });
}

/**
 * HTTP console. Binds 127.0.0.1 unless LAN share is on.
 *
 * Rebinding is how Forward port / Stop sharing work from the page — including
 * from a phone on the same network. Closing then listening again is the only
 * way to change the host without a restart.
 */
export function createApp({ cwd, docs = null, since = null, port = 4180, lan = false, tunnel = false } = {}) {
  const bound = { port: Number(port), lan: Boolean(lan), tunnel: Boolean(tunnel) };
  let httpServer = null;
  let bindHost = bound.lan ? "0.0.0.0" : "127.0.0.1";
  let tunnelHandle = null;

  const access = () =>
    accessInfo({
      cwd,
      port: bound.port,
      lan: bound.lan,
      tunnel: tunnelHandle && {
        tool: tunnelHandle.tool,
        url: tunnelHandle.url,
        error: tunnelHandle.error,
        waiting: tunnelHandle.waiting,
      },
    });

  function stopTunnel() {
    if (!tunnelHandle) return;
    tunnelHandle.stop();
    tunnelHandle = null;
    bound.tunnel = false;
  }
  process.once("exit", stopTunnel);

  function ensureTunnel() {
    if (tunnelHandle && (tunnelHandle.url || tunnelHandle.waiting)) return tunnelHandle;
    stopTunnel();
    bound.tunnel = true;
    tunnelHandle = startTunnel({ port: bound.port });
    return tunnelHandle;
  }

  const handler = (req, res) => {
    const url = (req.url || "/").split("?")[0];

    if (url === "/api/state") {
      try {
        return send(
          res,
          200,
          JSON.stringify(buildState(cwd, { docs, since, access: access() }), null, 2),
          "application/json"
        );
      } catch (err) {
        return send(res, 500, JSON.stringify({ error: String(err) }), "application/json");
      }
    }

    if (url === "/api/lan" && req.method === "POST") {
      return readBody(req).then((body) => {
        if (typeof body.on !== "boolean") {
          return send(res, 400, JSON.stringify({ error: "body must be { on: true|false }" }), "application/json");
        }
        // Answer first, then rebind. close() waits for open connections, so
        // awaiting the rebind inside this request would deadlock.
        bound.lan = body.on;
        if (body.on && body.tunnel !== false) ensureTunnel();
        if (!body.on) stopTunnel();
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          Connection: "close",
        });
        res.end(JSON.stringify(access()));
        setTimeout(() => {
          setLan(bound.lan)
            .then(() => {
              if (bound.lan && body.tunnel !== false && !tunnelHandle) ensureTunnel();
            })
            .catch((err) => {
              console.error(`agenttrace: could not rebind: ${err.message}`);
            });
        }, 250);
      });
    }

    if (url === "/api/stop" && req.method === "POST") {
      stopTunnel();
      send(res, 200, JSON.stringify({ ok: true }), "application/json");
      setTimeout(() => process.exit(0), 150);
      return;
    }

    if (url === "/api/export") {
      try {
        const html = snapshotHtml(fs.readFileSync(UI, "utf8"), buildState(cwd, { docs, since, access: access() }));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": 'attachment; filename="agenttrace.html"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(html);
      } catch (err) {
        return send(res, 500, String(err), "text/plain");
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
  };

  async function setLan(on) {
    bound.lan = Boolean(on);
    if (!on) stopTunnel();
    const want = bound.lan ? "0.0.0.0" : "127.0.0.1";
    if (httpServer?.listening && bindHost === want) return access();
    if (httpServer?.listening) {
      if (typeof httpServer.closeAllConnections === "function") httpServer.closeAllConnections();
      await closeServer(httpServer);
    }
    httpServer = http.createServer(handler);
    bound.port = await listenOn(httpServer, bound.port, want);
    bindHost = want;
    return access();
  }

  async function start() {
    httpServer = http.createServer(handler);
    bindHost = bound.lan ? "0.0.0.0" : "127.0.0.1";
    bound.port = await listenOn(httpServer, bound.port, bindHost);
    if (bound.tunnel) ensureTunnel();
    return access();
  }

  async function waitTunnel(ms = 15_000) {
    if (!tunnelHandle) return null;
    return tunnelHandle.wait(ms);
  }

  return {
    start,
    setLan,
    access,
    waitTunnel,
    close: async () => {
      stopTunnel();
      await closeServer(httpServer);
    },
    get server() {
      return httpServer;
    },
  };
}

