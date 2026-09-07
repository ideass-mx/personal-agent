import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const DOC = path.join(
  repoRoot,
  "docs/architecture/phase24-tool-capability-architecture.md",
);
const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const DEFINITION = path.join(repoRoot, "gateway/src/agents/definition.ts");
const POLICY = path.join(repoRoot, "gateway/src/tools/policy.ts");
const DISCOVER = path.join(repoRoot, "gateway/src/tools/discover.ts");
const WAITER = path.join(repoRoot, "gateway/src/sessions/confirmation-waiter.ts");
const NODE_MCP = path.join(repoRoot, "node/src/mcp/server.ts");
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|PermissionManager|ToolManager|MCPRegistry|NodeRegistry)\b/;

describe("PHASE 24 Tool / Capability architecture (audit)", () => {
  it("docs: AUDIT CLOSED; decisión A; Tool suficiente", () => {
    const doc = readFileSync(DOC, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /A — Tool es suficiente/);
    assert.match(doc, /toolPolicy/);
    assert.match(doc, /ConfirmationWaiter/);
    assert.match(doc, /availability/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("código: policy en discovery; confirmation en Gateway; sin managers prohibidos", () => {
    for (const file of [
      RUNTIME,
      DEFINITION,
      POLICY,
      DISCOVER,
      WAITER,
      NODE_MCP,
    ]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), FORBIDDEN, file);
    }

    const def = readFileSync(DEFINITION, "utf8");
    assert.match(def, /toolPolicy: ToolPolicy/);
    // PHASE 63: enabledTools = capability identities (nombre histórico retained).
    assert.match(def, /enabledTools/);

    const discover = readFileSync(DISCOVER, "utf8");
    assert.match(discover, /assertToolPolicyAnnounced/);
    assert.match(discover, /executionMode = policy\[tool\.name\]/);

    const runtime = readFileSync(RUNTIME, "utf8");
    assert.match(runtime, /export interface AgentRuntimeTools/);
    // PHASE 57.5: Tool Safety evaluate → HITL; still no MCP inside Runtime.
    assert.match(runtime, /evaluateToolSafety/);
    assert.match(runtime, /CONFIRMATION_REQUIRED/);
    assert.doesNotMatch(runtime, /from "\.\.\/tools\/mcp-/);
    assert.doesNotMatch(runtime, /better-sqlite3|hono|workspace-http/);

    const waiter = readFileSync(WAITER, "utf8");
    assert.match(waiter, /sin SQLite/);
    assert.match(waiter, /sessionId/);

    const mcp = readFileSync(NODE_MCP, "utf8");
    assert.match(mcp, /registerTool/);
    assert.match(mcp, /tool\.execute/);
  });
});
