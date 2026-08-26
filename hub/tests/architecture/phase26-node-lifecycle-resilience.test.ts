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
  "docs/architecture/phase26-node-lifecycle-resilience.md",
);
const INDEX = path.join(repoRoot, "hub/src/index.ts");
const ATTACH = path.join(repoRoot, "hub/src/runtime/attach-agent.ts");
const STDIO = path.join(repoRoot, "hub/src/tools/mcp-stdio.ts");
const EXEC = path.join(repoRoot, "hub/src/tools/mcp-executor.ts");
const SERVER = path.join(repoRoot, "hub/src/http/server.ts");
const FORBIDDEN =
  /\b(NodeRegistry|nodeId|heartbeat|respawn|PermissionManager)\b/;

describe("PHASE 26 Node lifecycle / resilience (audit)", () => {
  it("docs: AUDIT CLOSED; clasificación A; sin recovery", () => {
    const doc = readFileSync(DOC, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /Clasificación: A/);
    assert.match(doc, /snapshot/);
    assert.match(doc, /cancelAllConfirmations/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("startup fail-closed; health es boolean; disconnect cancela confirms; sin respawn", () => {
    const index = readFileSync(INDEX, "utf8");
    assert.ok(index.indexOf("attachLocalAgent") < index.indexOf("startServer"));
    assert.ok(index.indexOf("startServer") < index.indexOf("[hub] READY"));
    assert.match(index, /agentReady:\s*agent\.ready/);
    assert.match(index, /process\.once\("SIGINT"/);
    assert.match(index, /process\.once\("SIGTERM"/);
    assert.doesNotMatch(index, FORBIDDEN);
    assert.doesNotMatch(index, /onDisconnected/);

    const attach = readFileSync(ATTACH, "utf8");
    assert.match(attach, /registerDiscoveredAgentTools/);
    assert.match(attach, /cancelAllConfirmations/);
    assert.match(attach, /shutdownOnce/);
    assert.doesNotMatch(attach, FORBIDDEN);

    const stdio = readFileSync(STDIO, "utf8");
    assert.match(stdio, /client\.connect\(transport\)/);
    assert.match(stdio, /transport\.onclose/);

    const exec = readFileSync(EXEC, "utf8");
    assert.match(exec, /MCP_TOOL_TIMEOUT_MS/);
    assert.match(exec, /isDisconnected/);
    assert.match(exec, /AGENT_DISCONNECTED/);
    assert.doesNotMatch(exec, /\bretry\(/);

    const server = readFileSync(SERVER, "utf8");
    assert.match(server, /agentReady\?: boolean/);
    assert.match(server, /agentReady: extras\?\.agentReady/);
  });
});
