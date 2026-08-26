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
  "docs/architecture/phase25-node-mcp-topology.md",
);
const INDEX = path.join(repoRoot, "hub/src/index.ts");
const ATTACH = path.join(repoRoot, "hub/src/runtime/attach-agent.ts");
const RUNTIME = path.join(repoRoot, "hub/src/agent/runtime.ts");
const NODE_MAIN = path.join(repoRoot, "agent/src/index.ts");
const NODE_MCP = path.join(repoRoot, "agent/src/mcp/server.ts");
const FORBIDDEN =
  /\b(NodeRegistry|McpServerRegistry|nodeId|Distributed Runtime|PermissionManager)\b/;

describe("PHASE 25 Node / MCP topology (audit)", () => {
  it("docs: AUDIT CLOSED; decisión A; un Node un MCP Server", () => {
    const doc = readFileSync(DOC, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /A — Arquitectura actual suficiente/);
    assert.match(doc, /attachLocalAgent/);
    assert.match(doc, /un MCP Server/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("composición: spawn único; Runtime y Node sin cruzar fronteras", () => {
    const index = readFileSync(INDEX, "utf8");
    assert.match(index, /attachLocalAgent/);
    assert.ok(index.indexOf("attachLocalAgent") < index.indexOf("[hub] READY"));
    const shutdownFn = index.slice(index.indexOf("const shutdown"));
    assert.ok(shutdownFn.indexOf("http.close") < shutdownFn.indexOf("agent.shutdown"));
    assert.doesNotMatch(index, /respawn|NodeRegistry/);
    assert.doesNotMatch(index, FORBIDDEN);

    const attach = readFileSync(ATTACH, "utf8");
    assert.match(attach, /registerDiscoveredAgentTools/);
    assert.match(attach, /cancelAllConfirmations/);
    assert.doesNotMatch(attach, /workspace|Workspace/);
    assert.doesNotMatch(attach, FORBIDDEN);

    const runtime = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(runtime, /mcp-stdio|mcp-executor|attachLocalAgent/);
    assert.doesNotMatch(runtime, /child_process|StdioClientTransport/);

    const nodeMain = readFileSync(NODE_MAIN, "utf8");
    assert.match(nodeMain, /startLocalAgent/);
    assert.doesNotMatch(nodeMain, /workspace_id|AgentDefinition|runTurn/);

    const mcp = readFileSync(NODE_MCP, "utf8");
    assert.match(mcp, /createAgentMcpServer/);
    assert.match(mcp, /new McpServer/);
  });
});
