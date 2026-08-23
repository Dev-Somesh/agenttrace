/**
 * Optional public tunnel via a binary already on the machine.
 *
 * agenttrace does not bundle ngrok or talk to its API. It starts a local
 * process (`ngrok` or `cloudflared`) and reads the public URL from that
 * process's own output. Off by default.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const TUNNEL_TOOLS = [
  { id: "ngrok", label: "ngrok" },
  { id: "cloudflared", label: "cloudflared" },
];

export function which(bin, envPath = process.env.PATH) {
  if (!bin) return null;
  const dirs = String(envPath || "").split(path.delimiter);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

export function availableTunnels(envPath = process.env.PATH) {
  return TUNNEL_TOOLS.filter((t) => which(t.id, envPath)).map((t) => ({ ...t }));
}

function isPublicHttps(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false;
    if (/^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Pull a public https URL out of ngrok / cloudflared stdout or stderr. */
export function parseTunnelUrl(text) {
  if (!text) return null;
  const json = String(text).match(/"url"\s*:\s*"(https:\/\/[^"]+)"/);
  if (json && isPublicHttps(json[1])) return json[1];
  const fwd = String(text).match(/Forwarding\s+(https:\/\/\S+)/i);
  if (fwd && isPublicHttps(fwd[1])) return fwd[1];
  const named = String(text).match(
    /https:\/\/[a-z0-9][a-z0-9-]*\.(?:ngrok(?:-free)?\.(?:app|io|dev)|trycloudflare\.com)/i
  );
  if (named && isPublicHttps(named[0])) return named[0];
  return null;
}

export function parseTunnelError(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => /authentication failed|ERR_NGROK|error code|failed to|unauthorized/i.test(s));
  return line || null;
}

function argsFor(id, port) {
  if (id === "ngrok") return ["http", String(port), "--log", "stdout", "--log-format", "json"];
  if (id === "cloudflared") {
    return ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"];
  }
  return null;
}

/**
 * Start a tunnel process. `wait()` resolves when a public URL appears
 * (or the timeout / an error). The caller owns `stop()`.
 */
export function startTunnel({ port, tool = null, envPath = process.env.PATH } = {}) {
  const tools = availableTunnels(envPath);
  const id = tool && tools.some((t) => t.id === tool) ? tool : tools[0]?.id || null;
  if (!id) {
    return {
      tool: null,
      get url() {
        return null;
      },
      get error() {
        return "No ngrok or cloudflared on PATH";
      },
      get waiting() {
        return false;
      },
      stop() {},
      wait: async () => null,
    };
  }

  const bin = which(id, envPath);
  const args = argsFor(id, port);
  let url = null;
  let error = null;
  let buf = "";
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });

  const scan = (chunk) => {
    buf += String(chunk);
    if (buf.length > 200_000) buf = buf.slice(-80_000);
    if (!url) {
      const found = parseTunnelUrl(buf);
      if (found) url = found;
    }
    if (!url && !error) {
      const err = parseTunnelError(buf);
      if (err) error = err;
    }
  };
  child.stdout.on("data", scan);
  child.stderr.on("data", scan);
  child.on("exit", (code) => {
    if (!url && !error) error = code ? `${id} exited ${code}` : `${id} stopped`;
  });

  return {
    tool: id,
    get url() {
      return url;
    },
    get error() {
      return error;
    },
    get waiting() {
      return !url && !error && child.exitCode == null;
    },
    stop() {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    },
    wait(ms = 15_000) {
      return new Promise((resolve) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (url || error || Date.now() - t0 > ms) {
            clearInterval(iv);
            resolve(url);
          }
        }, 100);
      });
    },
  };
}
