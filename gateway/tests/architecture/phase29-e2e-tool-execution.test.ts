import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const EXPECTED_TOOLS = [
  "agent.echo",
  "filesystem.read",
  "filesystem.list",
  "filesystem.write",
  "process.execute",
  "math.add",
  "math.subtract",
  "math.multiply",
  "math.divide",
  "system.info",
  "diagnostics.ping",
  "customer.demo",
  "office.excel.read",
  "office.excel.write",
] as const;

const CONFIRM = new Set([
  "filesystem.write",
  "process.execute",
  "office.excel.write",
]);

describe("PHASE 29 E2E tool execution (audit)", () => {
  it("docs: CLOSED; READY WITH DEBT; PHASE 30 not started", () => {
    const doc = readFileSync(
      path.join(repoRoot, "docs/architecture/phase29-e2e-tool-execution.md"),
      "utf8",
    );
    assert.match(doc, /PHASE 29 CLOSED \/ AUDIT ONLY/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /PHASE 30 NOT STARTED/);
    assert.match(doc, /GENERIC_INPUT_SCHEMA|schema negocio/i);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("policy: 14 tools; mutating confirm; deny-by-default", () => {
    assert.equal(Object.keys(DEFAULT_TOOL_POLICY).length, 14);
    for (const name of EXPECTED_TOOLS) {
      assert.ok(name in DEFAULT_TOOL_POLICY, name);
      const mode = DEFAULT_TOOL_POLICY[name];
      if (CONFIRM.has(name)) assert.equal(mode, "confirm");
      else assert.equal(mode, "automatic");
    }
  });

  it("discovery: policy executionMode; schema sanitize + fallback; MCP envelope", () => {
    const discover = readFileSync(
      path.join(repoRoot, "gateway/src/tools/discover.ts"),
      "utf8",
    );
    assert.match(discover, /GENERIC_INPUT_SCHEMA/);
    assert.match(discover, /sanitizeDiscoveredInputSchema/);
    assert.match(discover, /executionMode,\s*$/m);
    assert.match(discover, /if \(executionMode === undefined\) continue/);

    const sanitize = readFileSync(
      path.join(repoRoot, "gateway/src/tools/schema-sanitize.ts"),
      "utf8",
    );
    assert.match(sanitize, /additionalProperties:\s*true/);
    assert.match(sanitize, /SCHEMA_FALLBACK_KEY/);

    const mcp = readFileSync(
      path.join(repoRoot, "node/src/mcp/server.ts"),
      "utf8",
    );
    assert.match(mcp, /remoteEnvelope/);
    assert.match(mcp, /input:\s*z\.unknown\(\)/);
    assert.doesNotMatch(mcp, /\.listen\(createServer\(http\.createServer/);

    const defaults = readFileSync(
      path.join(repoRoot, "node/src/extensions/defaults.ts"),
      "utf8",
    );
    assert.match(defaults, /createOfficeExtension/);
    assert.doesNotMatch(defaults, /customer\.test|customerTest/);
  });

  it("cadena Android HITL + Node env + no Runtime/Workspace en MCP", () => {
    const hubChat = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt",
      ),
      "utf8",
    );
    assert.match(hubChat, /ServerMessage\.ConfirmRequest/);
    assert.match(hubChat, /sendConfirmResponse/);

    const stdio = readFileSync(
      path.join(repoRoot, "gateway/src/tools/mcp/stdio.ts"),
      "utf8",
    );
    assert.match(stdio, /childEnvForLocalNode/);

    const runtime = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtime, /mcp-stdio|attachLocalAgent|workspace_id/);

    const index = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    assert.doesNotMatch(
      index,
      /\b(NodeRegistry|PermissionManager|Capability)\b/,
    );
  });
});
