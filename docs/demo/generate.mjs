/**
 * Builds a throwaway project whose transcripts read like a real afternoon on a
 * small API, then leaves it staged for `runlanes --export`.
 *
 * The test fixtures cannot do this job. They are written to make assertions
 * fail loudly, so their timestamps sit months apart and their runs record no
 * usage — accurate for a parser test, unreadable as a demo. These transcripts
 * are the opposite: every figure is plausible, every clock is relative to the
 * moment the file is generated, and the runners deliberately overlap on a few
 * files so the shared-file graph has something to draw.
 *
 * Nothing here is measured from a real session. It is staged data, and the
 * page that publishes it should say so.
 *
 *   node docs/demo/generate.mjs <outdir>
 *
 * Writes <outdir>/home (a fake HOME) and <outdir>/acme-api (the project).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUT = path.resolve(process.argv[2] || "demo-project");
const HOME = path.join(OUT, "home");
const CWD = path.join(OUT, "acme-api");

const NOW = Date.now();
const min = (m) => new Date(NOW - m * 60_000).toISOString();
const sec = (s) => new Date(NOW - s * 1000).toISOString();
const write = (p, body) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
const lines = (...rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

fs.rmSync(OUT, { recursive: true, force: true });

// ── The project ────────────────────────────────────────────────────────────
// Files the transcripts refer to have to exist: scraped shell paths are
// existence-checked, so a repo of invented names would silently lose edges.
const FILES = [
  "package.json", "README.md", "AGENTS.md", "GEMINI.md",
  "src/server.ts", "src/auth.ts", "src/db.ts",
  "src/middleware/rate-limit.ts", "src/routes/users.ts", "src/models/user.ts",
  "test/auth.test.ts",
];
for (const f of FILES) write(path.join(CWD, f), `// ${f}\n`);
write(path.join(CWD, ".github/instructions/style.md"), "# Style\nBe brief.\n");
write(path.join(CWD, ".kiro/steering/product.md"), "# Product\nShip the auth rewrite.\n");
write(path.join(CWD, ".claude/agents/reviewer.md"), "# Reviewer\nCheck auth paths.\n");
write(path.join(CWD, ".cursor/rules/api.mdc"), "# API rules\nPrefer explicit types.\n");

// ── Claude Code ────────────────────────────────────────────────────────────
// A finished session: a parent that did its own work and two subagents that
// genuinely overlapped, which is what makes the parallelism figure non-trivial.
{
  const enc = CWD.replace(/[/\s]+/g, "-");
  const proj = path.join(HOME, ".claude", "projects", enc);
  const subs = path.join(proj, "sess-auth-rewrite", "subagents");

  const turn = (t, i, o, cw, cr, content) => ({
    type: "assistant", timestamp: t,
    message: { model: "claude-sonnet-5", usage: { input_tokens: i, output_tokens: o, cache_creation_input_tokens: cw, cache_read_input_tokens: cr }, ...(content ? { content } : {}) },
  });
  const use = (name, input) => [{ type: "tool_use", name, input }];

  write(path.join(proj, "sess-auth-rewrite.jsonl"), lines(
    { type: "user", timestamp: min(35), message: { role: "user", content: "Rewrite the auth middleware and add rate limiting" } },
    turn(min(35), 4200, 180, 12000, 0, use("Read", { file_path: "src/auth.ts" })),
    turn(min(34), 900, 240, 0, 41000, use("Read", { file_path: "src/server.ts" })),
    turn(min(31), 1100, 890, 3400, 52000, use("Edit", { file_path: "src/auth.ts" })),
    turn(min(24), 760, 1240, 0, 88000),
    turn(min(13), 540, 410, 0, 96000, use("Bash", { command: "npm test -- test/auth.test.ts" })),
  ));

  write(path.join(subs, "agent-rate-limit.meta.json"), JSON.stringify({ agentType: "general-purpose", description: "Add rate limiting to the auth middleware", spawnDepth: 1 }));
  write(path.join(subs, "agent-rate-limit.jsonl"), lines(
    { type: "user", timestamp: min(30), message: { role: "user", content: "Add rate limiting to the auth middleware" } },
    turn(min(30), 3100, 120, 9000, 0, use("Read", { file_path: "src/auth.ts" })),
    turn(min(29), 640, 210, 0, 22000, use("Read", { file_path: "src/server.ts" })),
    turn(min(26), 820, 1680, 2100, 31000, use("Write", { file_path: "src/middleware/rate-limit.ts", content: "export const limiter = {}\n" })),
    turn(min(22), 410, 520, 0, 44000, use("Edit", { file_path: "src/auth.ts" })),
  ));

  // This run and the rate-limit run both edit src/auth.ts while both are live:
  // a collision, which is a stronger claim than sharing a file and the one the
  // console should be able to demonstrate.
  write(path.join(subs, "agent-audit.meta.json"), JSON.stringify({ agentType: "Explore", description: "Audit the auth flow for missing checks", spawnDepth: 1 }));
  write(path.join(subs, "agent-audit.jsonl"), lines(
    { type: "user", timestamp: min(29), message: { role: "user", content: "Audit the auth flow for missing checks" } },
    turn(min(29), 2800, 90, 8200, 0, use("Read", { file_path: "src/auth.ts" })),
    turn(min(27), 520, 160, 0, 19000, use("Read", { file_path: "src/server.ts" })),
    turn(min(25), 480, 140, 0, 26000, use("Read", { file_path: "test/auth.test.ts" })),
    turn(min(23), 690, 740, 0, 30000, use("Edit", { file_path: "src/auth.ts" })),
    turn(min(21), 610, 980, 0, 33000),
  ));
}

// ── Cursor ─────────────────────────────────────────────────────────────────
// Still running, so the console has something live to show. Cursor's
// transcripts carry no usage, which is why its figures read "—" rather than 0.
{
  const enc = CWD.replace(/^[\\/]+/, "").replace(/[/\\\s]+/g, "-");
  const dir = path.join(HOME, ".cursor", "projects", enc, "agent-transcripts", "conv-users-route");
  const stamp = (d, q) => ({ role: "user", message: { content: [{ type: "text", text: `<timestamp>${d}</timestamp>\n<user_query>\n${q}\n</user_query>` }] } });
  const fmt = (iso) => new Date(iso).toUTCString();
  const tool = (name, input) => ({ role: "assistant", message: { content: [{ type: "tool_use", name, input }] } });

  write(path.join(dir, "conv-users-route.jsonl"), lines(
    stamp(fmt(min(8)), "Add the users route"),
    { role: "assistant", message: { content: [{ type: "text", text: "Reading the existing auth middleware first." }] } },
    tool("Read", { path: "src/auth.ts" }),
    tool("Write", { path: "src/routes/users.ts", contents: "export const users = {}\n" }),
    tool("Shell", { command: "cat package.json", description: "check deps" }),
    stamp(fmt(sec(25)), "now wire it into the server"),
  ));
  write(path.join(dir, "subagents", "sub-types.jsonl"), lines(
    stamp(fmt(min(6)), "Check the exported types line up"),
    tool("Read", { path: "src/models/user.ts" }),
    tool("Read", { path: "src/routes/users.ts" }),
  ));
}

// ── Codex ──────────────────────────────────────────────────────────────────
{
  const d = new Date(NOW - 28 * 60_000);
  const dir = path.join(HOME, ".codex", "sessions", String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0"));
  write(path.join(dir, "rollout-codex-db-layer.jsonl"), lines(
    { timestamp: min(28), type: "session_meta", payload: { id: "sess-codex-db", cwd: CWD, source: "cli", model_provider: "openai" } },
    { timestamp: min(28), type: "event_msg", payload: { type: "user_message", message: "Extract the query helpers into src/db.ts" } },
    { timestamp: min(28), type: "turn_context", payload: { model: "gpt-5.4", collaboration_mode: { settings: { model: "gpt-5.4", reasoning_effort: "medium" } } } },
    { timestamp: min(27), type: "response_item", payload: { type: "function_call", name: "shell_command", arguments: JSON.stringify({ command: "cat src/server.ts" }) } },
    { timestamp: min(26), type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: "*** Begin Patch\n*** Update File: src/db.ts\n+export const query = () => {}\n*** End Patch" } },
    { timestamp: min(22), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 18400, output_tokens: 2600, cached_input_tokens: 12000, reasoning_output_tokens: 900 } } } },
  ));
}

// ── Gemini CLI ─────────────────────────────────────────────────────────────
{
  const hash = crypto.createHash("sha256").update(path.resolve(CWD)).digest("hex");
  const dir = path.join(HOME, ".gemini", "tmp", hash, "chats");
  write(path.join(dir, "session-gemini-models.jsonl"), lines(
    { sessionId: "sess-gemini-models", projectHash: hash, startTime: min(20), lastUpdated: min(16), kind: "main" },
    { id: "u1", timestamp: min(20), type: "user", content: "Generate the user model from the db helpers" },
    { id: "g1", timestamp: min(18), type: "gemini", model: "gemini-2.5-pro", content: "Reading the helpers.", tokens: { input: 9400, output: 1200, cached: 4100, thoughts: 320, total: 15020 }, toolCalls: [{ id: "t1", name: "read_file", args: { file_path: "src/db.ts" } }, { id: "t2", name: "write_file", args: { file_path: "src/models/user.ts", content: "export type User = {}\n" } }] },
    { id: "g2", timestamp: min(16), type: "gemini", model: "gemini-2.5-pro", content: "Done.", tokens: { input: 2100, output: 640, cached: 8800, thoughts: 110, total: 11650 }, toolCalls: [{ id: "t3", name: "run_shell_command", args: { command: "cat package.json" } }] },
  ));
}

// ── GitHub Copilot CLI ─────────────────────────────────────────────────────
{
  const dir = path.join(HOME, ".copilot", "session-state", "sess-copilot-tests");
  write(path.join(dir, "events.jsonl"), lines(
    { type: "session.start", timestamp: min(15), data: { sessionId: "sess-copilot-tests", context: { cwd: CWD } } },
    { type: "session.model_change", timestamp: min(15), data: { newModel: "gpt-4.1" } },
    { type: "user.message", timestamp: min(15), data: { content: "Cover the new middleware with tests" } },
    { type: "tool.execution_start", timestamp: min(14), data: { toolCallId: "1", toolName: "view", arguments: { path: "src/server.ts" } } },
    { type: "tool.execution_start", timestamp: min(14), data: { toolCallId: "2", toolName: "view", arguments: { path: "src/middleware/rate-limit.ts" } } },
    { type: "tool.execution_start", timestamp: min(13), data: { toolCallId: "3", toolName: "create", arguments: { path: "test/auth.test.ts" } } },
    { type: "assistant.turn_end", timestamp: min(13), data: {} },
  ));
}

// ── Kiro ───────────────────────────────────────────────────────────────────
// Billed in credits, so it reports files and documents but no usage. That gap
// is the point: the console shows "—" rather than inventing a token figure.
{
  const enc = Buffer.from(path.resolve(CWD)).toString("base64").replace(/=+$/, "");
  const root = process.platform === "darwin"
    ? path.join(HOME, "Library", "Application Support", "Kiro", "User", "globalStorage", "kiro.kiroagent")
    : path.join(HOME, ".config", "Kiro", "User", "globalStorage", "kiro.kiroagent");
  const ws = path.join(root, "workspace-sessions", enc);
  write(path.join(ws, "execution.json"), JSON.stringify({
    executionId: "exec-steering", workflowType: "chat-agent", status: "succeed",
    startTime: NOW - 30 * 60_000, endTime: NOW - 26 * 60_000, chatSessionId: "sess-kiro-steering",
    actions: [
      { actionType: "readFiles", actionState: "Accepted", input: { files: [{ path: "src/auth.ts" }] } },
      { actionType: "readFiles", actionState: "Accepted", input: { files: [{ path: "README.md" }] } },
      { actionType: "write", actionState: "Accepted", input: { file: "src/server.ts" } },
      { actionType: "say", actionState: "Success" },
    ],
  }, null, 2));
  write(path.join(ws, "session.json"), JSON.stringify({
    sessionId: "sess-kiro-steering", title: "Align the server with the steering docs",
    workspaceDirectory: CWD, selectedModel: "auto", sessionType: "vibe",
    dateCreated: String(NOW - 30 * 60_000),
    history: [
      { message: { role: "user", content: [{ type: "text", text: "Align the server with the steering docs" }], id: "u1" }, executionId: "exec-steering" },
      { message: { role: "assistant", content: "Reading the steering files.", id: "a1" }, executionId: "exec-steering" },
    ],
  }, null, 2));

  // Kiro infers status from write recency rather than from a timestamp in the
  // file, so a freshly generated session would report itself as still running.
  // Age the files to the moment the execution actually ended.
  const ended = new Date(NOW - 26 * 60_000);
  for (const f of ["execution.json", "session.json"]) fs.utimesSync(path.join(ws, f), ended, ended);
}

console.log(JSON.stringify({ home: HOME, cwd: CWD }, null, 2));
