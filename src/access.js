/**
 * Local reachability. Nothing here talks to the network; it only reads
 * addresses the OS already assigned, so the page can list every URL this
 * console is (or would be) reachable at. A public tunnel URL is passed in
 * after a local binary (ngrok, …) prints it.
 */
import os from "node:os";
import path from "node:path";
import { availableTunnels } from "./tunnel.js";

export function projectName(cwd) {
  const base = path.basename(path.resolve(cwd || "."));
  return base || "project";
}

/**
 * What a NIC is for, in words a person on a phone can use.
 * Returns null for loopback and for interfaces that are never a useful URL
 * (AirDrop, VM bridges, …).
 */
export function classifyIface(name) {
  const n = String(name || "").toLowerCase();
  if (!n || n === "lo" || n.startsWith("lo")) return null;
  if (/^(awdl|llw|anpi|gif|stf|ap\d|dummy|vmnet|vmenet|bridge)/.test(n)) return null;
  if (/^(utun|tun|wg|ipsec|ppp|tailscale)/.test(n)) {
    return { kind: "vpn", related: `VPN · ${name}` };
  }
  if (/^(docker|veth|br-|cni|flannel)/.test(n)) {
    return { kind: "container", related: `container · ${name}` };
  }
  if (/^(wl|wlan|en0$)/.test(n)) return { kind: "wifi", related: `Wi-Fi · ${name}` };
  if (/^(en|eth|em|re|igb|ix)/.test(n)) return { kind: "lan", related: `LAN · ${name}` };
  return { kind: "net", related: `network · ${name}` };
}

export function lanInterfaces(nics = os.networkInterfaces()) {
  const out = [];
  for (const [name, addrs] of Object.entries(nics || {})) {
    const cls = classifyIface(name);
    if (!cls) continue;
    for (const a of addrs || []) {
      const family = a.family === 4 || a.family === "IPv4";
      if (a.internal || !family) continue;
      out.push({ iface: name, address: a.address, ...cls });
    }
  }
  return out;
}

/**
 * Every URL this process can be opened at, and what each one is for.
 *
 * `live` is whether a request to that URL would actually hit this process
 * right now. Localhost is always live. The others are live only after the
 * port is forwarded (bound on all interfaces).
 */
export function accessInfo({ cwd, port, lan, nics, tunnel = null }) {
  const project = projectName(cwd);
  const p = port == null || port === "" ? null : Number(port);
  const urls = [];
  if (tunnel?.url) {
    urls.push({
      url: tunnel.url,
      kind: "public",
      related: `public internet · ${tunnel.tool || "tunnel"}`,
      iface: tunnel.tool || "tunnel",
      live: true,
    });
  }
  if (p) {
    urls.push({
      url: `http://127.0.0.1:${p}`,
      kind: "local",
      related: "this machine only",
      iface: "lo",
      live: true,
    });
    for (const n of lanInterfaces(nics)) {
      urls.push({
        url: `http://${n.address}:${p}`,
        kind: n.kind,
        related: n.related,
        iface: n.iface,
        live: Boolean(lan),
      });
    }
  }
  return {
    project,
    cwd,
    lan: Boolean(lan),
    host: lan ? "0.0.0.0" : "127.0.0.1",
    port: p,
    urls,
    tunnel: {
      available: availableTunnels(),
      tool: tunnel?.tool || null,
      url: tunnel?.url || null,
      error: tunnel?.error || null,
      waiting: Boolean(tunnel?.waiting),
    },
  };
}
