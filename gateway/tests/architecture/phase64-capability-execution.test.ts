/**
 * PHASE 64 — fronteras de arquitectura del Execution Contract.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCapabilityExecutor,
  createCapabilityIndex,
  GATEWAY_TARGET_ID,
  LOCAL_NODE_TARGET_ID,
  selectDeterministicImplementation,
} from "../../src/capabilities/index.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool } from "../../src/tools/types.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 64 architecture boundaries", () => {
  it("docs audit + design existen", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_64_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_64_DESIGN.md")));
    const design = read("PHASE_64_DESIGN.md");
    assert.match(design, /CapabilityRequest/);
    assert.match(design, /deterministic/i);
    assert.match(design, /AI routing/);
  });

  it("Test 9: MCP Node execution path documented + local sync semantics", async () => {
    const design = read("PHASE_64_DESIGN.md");
    assert.match(design, /MCP\/stdio/);
    assert.match(design, /node-local/);
    assert.match(design, /RemoteAgentTool|ToolRegistry/);

    // Topology: native + node-local + mcp/stdio remains the mapped path
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "filesystem.read" });
    index.registerImplementation({
      capabilityId: "filesystem.read",
      toolName: "filesystem.read",
      executionTargetId: LOCAL_NODE_TARGET_ID,
      implementationKind: "native",
      transport: "mcp/stdio",
    });
    const tools = new ToolRegistry();
    tools.register({
      name: "filesystem.read",
      description: "read",
      inputSchema: { type: "object" },
      executionMode: "automatic",
      async execute() {
        return { ok: true, content: { via: "mcp-sim" } };
      },
    } satisfies AgentTool);
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "filesystem.read": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "filesystem.read",
      input: { path: "x" },
      context: { conversationId: "c1" },
    });
    assert.equal(result.status, "success");
    assert.equal(result.resolution?.transport, "mcp/stdio");
    assert.equal(result.resolution?.executionTargetId, LOCAL_NODE_TARGET_ID);
    assert.equal(result.resolution?.implementationKind, "native");
    // MCP ≠ Node identity
    assert.notEqual(result.resolution?.transport, result.resolution?.executionTargetId);
  });

  it("Test 12: AgentDefinition topology independence", () => {
    const def = read("gateway/src/agents/definition.ts");
    assert.match(def, /enabledTools/);
    assert.doesNotMatch(def, /enabledNodes/);
    assert.doesNotMatch(def, /executionTargetId/);
    assert.doesNotMatch(def, /\bnodeId\b/);
    assert.doesNotMatch(def, /transport binding|mcp\/stdio/i);
  });

  it("Test 13: ObjectStorage / Artifact boundaries", () => {
    const storage = read("gateway/src/storage/types.ts");
    assert.doesNotMatch(storage, /from ["'].*capabilities/);
    assert.doesNotMatch(storage, /from ["'].*agents/);
    assert.doesNotMatch(storage, /from ["'].*tools\/mcp/);
    assert.doesNotMatch(storage, /CapabilityIndex|ExecutionTarget|AgentRuntime/);
    const art = read("gateway/src/artifacts/types.ts");
    assert.doesNotMatch(art, /ExecutionTarget|implementationKind/);
    assert.doesNotMatch(art, /from ["'].*capabilities/);
  });

  it("Test 14: AgentRuntime no importa MCP SDK ni capabilities/", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(runtime, /@modelcontextprotocol/);
    assert.doesNotMatch(runtime, /from ["'].*capabilities/);
    assert.doesNotMatch(runtime, /from ["'].*tools\/mcp/);
  });

  it("CapabilityExecutor no importa MCP SDK", () => {
    const exec = read("gateway/src/capabilities/executor.ts");
    assert.doesNotMatch(exec, /@modelcontextprotocol/);
    assert.doesNotMatch(exec, /from ["'].*tools\/mcp/);
    assert.match(exec, /No enruta|no balancea|no hace failover/i);
  });

  it("index composition wires CapabilityExecutor (not Universal Tool Host)", () => {
    const index = read("gateway/src/index.ts");
    assert.match(index, /createCapabilityExecutor/);
    assert.match(index, /bindToolsToCapabilityExecutor/);
    assert.doesNotMatch(index, /Control Plane/i);
  });

  it("multi-impl selection is stable and Agent-agnostic", () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "x.op" });
    for (const [tid, kind] of [
      ["node-b", "node"],
      ["node-a", "node"],
      [GATEWAY_TARGET_ID, "gateway"],
    ] as const) {
      index.upsertTarget({ id: tid, kind, status: "available" });
      index.registerImplementation({
        capabilityId: "x.op",
        toolName: "x.op",
        executionTargetId: tid,
        implementationKind: "native",
      });
    }
    const a = selectDeterministicImplementation(index.resolve("x.op"))!;
    const b = selectDeterministicImplementation(index.resolve("x.op"))!;
    assert.equal(a.executionTargetId, b.executionTargetId);
    assert.equal(a.executionTargetId, GATEWAY_TARGET_ID);
  });
});
