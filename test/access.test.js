import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIface, accessInfo, projectName } from "../src/access.js";

const nics = {
  lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
  en0: [{ family: "IPv4", address: "192.168.1.12", internal: false }],
  utun4: [{ family: "IPv4", address: "10.8.0.2", internal: false }],
  awdl0: [{ family: "IPv4", address: "169.254.1.1", internal: false }],
};

test("projectName is the directory basename", () => {
  assert.equal(projectName("/Users/me/work/runlanes"), "runlanes");
});

test("classifyIface names what a person would use the address for", () => {
  assert.equal(classifyIface("lo0"), null);
  assert.equal(classifyIface("awdl0"), null);
  assert.deepEqual(classifyIface("en0"), { kind: "wifi", related: "Wi-Fi · en0" });
  assert.deepEqual(classifyIface("en1"), { kind: "lan", related: "LAN · en1" });
  assert.deepEqual(classifyIface("utun4"), { kind: "vpn", related: "VPN · utun4" });
});

test("accessInfo lists every URL and what it is related to", () => {
  const off = accessInfo({ cwd: "/tmp/runlanes", port: 4180, lan: false, nics });
  assert.equal(off.project, "runlanes");
  assert.deepEqual(
    off.urls.map((u) => [u.related, u.url, u.live]),
    [
      ["this machine only", "http://127.0.0.1:4180", true],
      ["Wi-Fi · en0", "http://192.168.1.12:4180", false],
      ["VPN · utun4", "http://10.8.0.2:4180", false],
    ]
  );
});

test("when the port is forwarded every listed URL is live", () => {
  const info = accessInfo({ cwd: "/tmp/x", port: 5000, lan: true, nics });
  assert.equal(info.host, "0.0.0.0");
  assert.ok(info.urls.every((u) => u.live));
  assert.equal(info.urls.filter((u) => u.kind !== "public").length, 3);
});

test("a public tunnel URL is listed first, with what it is related to", () => {
  const info = accessInfo({
    cwd: "/tmp/runlanes",
    port: 4180,
    lan: true,
    nics,
    tunnel: { tool: "ngrok", url: "https://abc.ngrok-free.app", waiting: false },
  });
  assert.equal(info.urls[0].kind, "public");
  assert.equal(info.urls[0].related, "public internet · ngrok");
  assert.equal(info.urls[0].url, "https://abc.ngrok-free.app");
  assert.equal(info.tunnel.url, "https://abc.ngrok-free.app");
});
