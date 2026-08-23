import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTunnelUrl, parseTunnelError, availableTunnels, which } from "../src/tunnel.js";

test("parseTunnelUrl reads ngrok json logs", () => {
  const line = `{"lvl":"info","msg":"started tunnel","url":"https://abc123.ngrok-free.app"}`;
  assert.equal(parseTunnelUrl(line), "https://abc123.ngrok-free.app");
});

test("parseTunnelUrl reads the classic Forwarding line", () => {
  const text = "Forwarding  https://neat-cat.ngrok.io -> http://localhost:4180";
  assert.equal(parseTunnelUrl(text), "https://neat-cat.ngrok.io");
});

test("parseTunnelUrl reads a cloudflared trycloudflare URL", () => {
  const text = "Your quick Tunnel has been created! Visit it at:\nhttps://random-words.trycloudflare.com";
  assert.equal(parseTunnelUrl(text), "https://random-words.trycloudflare.com");
});

test("parseTunnelUrl ignores localhost and private addresses", () => {
  assert.equal(parseTunnelUrl('{"url":"https://127.0.0.1:4040"}'), null);
  assert.equal(parseTunnelUrl("Forwarding https://192.168.1.3:4180"), null);
});

test("parseTunnelError surfaces an auth failure", () => {
  const err = parseTunnelError("ERROR:  authentication failed: usage limits\nmore");
  assert.match(err, /authentication failed/);
});

test("which finds a binary on a fake PATH", () => {
  const found = which("ngrok");
  if (found) assert.match(found, /ngrok/);
  assert.equal(which("definitely-not-a-tunnel-bin-xyz"), null);
  assert.ok(Array.isArray(availableTunnels()));
});
