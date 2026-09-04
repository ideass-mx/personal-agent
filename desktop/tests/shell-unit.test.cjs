"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeDiagnostics,
  buildDiagnosticsReport,
} = require("../lib/diagnostics.cjs");
const { mapAgentState, AgentUiState } = require("../lib/states.cjs");
const { maskToken } = require("../lib/config.cjs");

test("sanitizeDiagnostics redacts secrets", () => {
  const raw =
    'HUB_TOKEN=abc123secret ANTHROPIC_API_KEY=sk-ant-xxx Authorization: Bearer tok';
  const out = sanitizeDiagnostics(raw);
  assert.equal(out.includes("abc123secret"), false);
  assert.equal(out.includes("sk-ant-xxx"), false);
  assert.match(out, /\[redacted\]/);
});

test("buildDiagnosticsReport has no token fields", () => {
  const report = buildDiagnosticsReport({
    version: "0.1.0",
    state: "READY",
    gateway: "running",
    node: "boot OK",
    mcp: "boot OK",
    tools: "14",
    workspaceConfigured: true,
    port: 8787,
    android: "unknown",
  });
  assert.match(report, /Personal Agent/);
  assert.equal(report.includes("HUB_TOKEN"), false);
});

test("mapAgentState not configured / ready / stopped", () => {
  assert.equal(
    mapAgentState({
      workspaceConfigured: false,
      processRunning: false,
      bootReady: false,
      healthOk: false,
    }),
    AgentUiState.NOT_CONFIGURED,
  );
  assert.equal(
    mapAgentState({
      workspaceConfigured: true,
      processRunning: true,
      bootReady: true,
      healthOk: true,
      networkReady: true,
      nodeStatus: "READY",
      agentReady: true,
    }),
    AgentUiState.READY,
  );
  assert.equal(
    mapAgentState({
      workspaceConfigured: true,
      processRunning: false,
      bootReady: false,
      healthOk: false,
      networkReady: true,
    }),
    AgentUiState.STOPPED,
  );
});

test("mapAgentState DEGRADED when Node DISCONNECTED", () => {
  assert.equal(
    mapAgentState({
      workspaceConfigured: true,
      processRunning: true,
      bootReady: true,
      healthOk: false,
      networkReady: true,
      nodeStatus: "DISCONNECTED",
      agentReady: false,
    }),
    AgentUiState.DEGRADED,
  );
});

test("install credential ≠ trusted device semantics", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-auth-sem-"));
  const prev = process.env.PERSONAL_AGENT_DATA_DIR;
  process.env.PERSONAL_AGENT_DATA_DIR = dir;
  for (const rel of [
    "../lib/config.cjs",
    "../lib/pairing.cjs",
    "../lib/agent-identity.cjs",
  ]) {
    delete require.cache[require.resolve(rel)];
  }
  try {
    const id = require("../lib/agent-identity.cjs");
    const cfg = require("../lib/config.cjs");
    assert.equal(id.hasPersistedInstallCredential(), false);
    assert.equal(id.hasPersistedPairingAuth(), false);
    cfg.ensureHubToken();
    delete require.cache[require.resolve("../lib/agent-identity.cjs")];
    delete require.cache[require.resolve("../lib/pairing.cjs")];
    const id2 = require("../lib/agent-identity.cjs");
    assert.equal(id2.hasPersistedInstallCredential(), true);
    // Deprecated alias still means install credential — not trusted device.
    assert.equal(id2.hasPersistedPairingAuth(), true);
  } finally {
    if (prev === undefined) delete process.env.PERSONAL_AGENT_DATA_DIR;
    else process.env.PERSONAL_AGENT_DATA_DIR = prev;
  }
});

test("maskToken never shows full secret", () => {
  const masked = maskToken("0123456789abcdef0123456789abcdef");
  assert.equal(masked.includes("0123456789abcdef0123456789abcdef"), false);
  assert.match(masked, /…/);
});

test("config persists workspaceRoot across save/load", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-cfg-"));
  process.env.PERSONAL_AGENT_DATA_DIR = dir;
  // Re-require after env — use isolated functions already exported
  delete require.cache[require.resolve("../lib/config.cjs")];
  const cfgMod = require("../lib/config.cjs");
  const cfg = cfgMod.loadConfig();
  cfg.workspaceRoot = path.join(dir, "ws");
  fs.mkdirSync(cfg.workspaceRoot, { recursive: true });
  cfg.firstRunComplete = true;
  cfgMod.saveConfig(cfg);
  delete require.cache[require.resolve("../lib/config.cjs")];
  const again = require("../lib/config.cjs").loadConfig();
  assert.equal(again.workspaceRoot, cfg.workspaceRoot);
  assert.equal(again.firstRunComplete, true);
  delete process.env.PERSONAL_AGENT_DATA_DIR;
});


test("launcher bat contract is encoded in package-windows (no npm)", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(
    path.join(__dirname, "../../scripts/package-windows.mjs"),
    "utf8",
  );
  assert.match(src, /No uses npm/);
  assert.match(src, /electron\.exe/);
});
