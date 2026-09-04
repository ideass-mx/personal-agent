/**
 * PHASE 64 — CapabilityExecutor unit tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GATEWAY_TARGET_ID,
  bindToolsToCapabilityExecutor,
  createCapabilityExecutor,
  createCapabilityIndex,
  selectDeterministicImplementation,
} from "../../src/capabilities/index.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool, ToolResult } from "../../src/tools/types.ts";
import type { ArtifactReference } from "../../src/artifacts/types.ts";

function fakeTool(
  name: string,
  execute: AgentTool["execute"],
): AgentTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object" },
    executionMode: "automatic",
    execute,
  };
}

function setupIndexMulti() {
  const index = createCapabilityIndex();
  index.upsertDescriptor({ id: "demo.echo" });
  index.upsertTarget({ id: "node-b", kind: "node", status: "available" });
  index.upsertTarget({ id: "node-a", kind: "node", status: "available" });
  index.upsertTarget({
    id: GATEWAY_TARGET_ID,
    kind: "gateway",
    status: "available",
  });
  index.registerImplementation({
    capabilityId: "demo.echo",
    toolName: "demo.echo",
    executionTargetId: "node-b",
    implementationKind: "native",
    transport: "mcp/stdio",
  });
  index.registerImplementation({
    capabilityId: "demo.echo",
    toolName: "demo.echo",
    executionTargetId: "node-a",
    implementationKind: "native",
    transport: "mcp/stdio",
  });
  index.registerImplementation({
    capabilityId: "demo.echo",
    toolName: "demo.echo",
    executionTargetId: GATEWAY_TARGET_ID,
    implementationKind: "native",
    transport: "in-process",
    metadata: { priority: 10 },
  });
  return index;
}

describe("PHASE 64 CapabilityExecutor", () => {
  it("Test 1: capability inexistente → capability_not_found", async () => {
    const index = createCapabilityIndex();
    const tools = new ToolRegistry();
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.missing": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.missing",
      input: {},
      context: { conversationId: "c1" },
      requestId: "cap_test_1",
    });
    assert.equal(result.requestId, "cap_test_1");
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, "capability_not_found");
  });

  it("Test 2: única implementación → success", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
      transport: "mcp/stdio",
    });
    const tools = new ToolRegistry();
    let called = 0;
    tools.register(
      fakeTool("demo.echo", async (input, ctx) => {
        called += 1;
        assert.equal(ctx.requestId, "cap_test_2");
        return { ok: true, content: { echo: input } };
      }),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: { n: 1 },
      context: { conversationId: "c1" },
      requestId: "cap_test_2",
    });
    assert.equal(called, 1);
    assert.equal(result.status, "success");
    assert.deepEqual(result.content, { echo: { n: 1 } });
    assert.equal(result.resolution?.executionTargetId, "node-local");
  });

  it("Test 3: múltiples implementations → selección determinista", () => {
    const index = setupIndexMulti();
    const candidates = index.resolve("demo.echo");
    assert.equal(candidates.length, 3);
    const selected = selectDeterministicImplementation(candidates)!;
    // gateway priority 10 > infinity for nodes → wait, lower priority wins (asc)
    // gateway has priority 10, nodes have Infinity → gateway wins (10 < Inf)
    assert.equal(selected.executionTargetId, GATEWAY_TARGET_ID);

    // Without priority on gateway, node-a < node-b lexicographically
    const index2 = createCapabilityIndex();
    index2.upsertDescriptor({ id: "demo.echo" });
    for (const id of ["node-b", "node-a", GATEWAY_TARGET_ID]) {
      index2.upsertTarget({
        id,
        kind: id === GATEWAY_TARGET_ID ? "gateway" : "node",
        status: "available",
      });
      index2.registerImplementation({
        capabilityId: "demo.echo",
        toolName: "demo.echo",
        executionTargetId: id,
        implementationKind: "native",
      });
    }
    const sel2 = selectDeterministicImplementation(index2.resolve("demo.echo"))!;
    assert.equal(sel2.executionTargetId, GATEWAY_TARGET_ID); // "gateway" < "node-a"
  });

  it("Test 4: target unavailable", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    index.unregisterByTarget("node-local");
    const tools = new ToolRegistry();
    let called = 0;
    tools.register(
      fakeTool("demo.echo", async () => {
        called += 1;
        return { ok: true, content: true };
      }),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
    });
    assert.equal(called, 0);
    assert.equal(result.status, "unavailable");
    assert.equal(result.error?.code, "target_unavailable");
  });

  it("Test 5: policy denied — no ejecuta Tool", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    const tools = new ToolRegistry();
    let called = 0;
    tools.register(
      fakeTool("demo.echo", async () => {
        called += 1;
        return { ok: true, content: true };
      }),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: {}, // deny all
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
      requestId: "cap_denied",
    });
    assert.equal(called, 0);
    assert.equal(result.status, "denied");
    assert.equal(result.error?.code, "policy_denied");
    assert.equal(result.resolution, undefined);
  });

  it("Test 6: requestId correlation request → result", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    const tools = new ToolRegistry();
    let seen: string | undefined;
    tools.register(
      fakeTool("demo.echo", async (_i, ctx) => {
        seen = ctx.requestId;
        return { ok: true, content: "ok" };
      }),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
      requestId: "cap_corr_42",
    });
    assert.equal(seen, "cap_corr_42");
    assert.equal(result.requestId, "cap_corr_42");
    assert.equal(result.resolution?.requestId, "cap_corr_42");
  });

  it("Test 7: execution timeout", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    const tools = new ToolRegistry();
    tools.register(
      fakeTool("demo.echo", async () => ({
        ok: false,
        error: { code: "remote_tool_timeout", message: "/secret/path timed out" },
      })),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
    });
    assert.equal(result.status, "timeout");
    assert.equal(result.error?.code, "execution_timeout");
    assert.doesNotMatch(result.error!.message, /secret|path/i);
  });

  it("Test 8: execution failure sin leak de internals", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    const tools = new ToolRegistry();
    tools.register(
      fakeTool("demo.echo", async () => ({
        ok: false,
        error: {
          code: "remote_tool_error",
          message: "ENOENT /home/secret/key.pem apiKey=sk-live-xxx",
        },
      })),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, "execution_failed");
    assert.doesNotMatch(result.error!.message, /secret|apiKey|sk-live|\.pem/i);
  });

  it("Test 10: Artifact passthrough sin storage.key", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    const artifact: ArtifactReference = {
      artifactId: "art_1",
      url: "/artifacts/art_1",
      mimeType: "text/plain",
      filename: "out.txt",
    };
    const tools = new ToolRegistry();
    tools.register(
      fakeTool("demo.echo", async () => ({
        ok: true,
        content: "done",
        artifacts: [artifact],
      })),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
    });
    assert.equal(result.status, "success");
    assert.equal(result.artifacts?.[0]?.artifactId, "art_1");
    assert.equal(result.artifacts?.[0]?.url, "/artifacts/art_1");
    const json = JSON.stringify(result);
    assert.doesNotMatch(json, /storage\.key|"provider"|"objects\//i);
  });

  it("Test 11: Credential isolation en resolution/result", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
      metadata: { note: "no secrets here" },
    });
    const tools = new ToolRegistry();
    tools.register(
      fakeTool("demo.echo", async () => ({ ok: true, content: { ok: true } })),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: { password: "should-not-echo-in-resolution" },
      context: { conversationId: "c1" },
    });
    const blob = JSON.stringify({
      resolution: result.resolution,
      error: result.error,
      status: result.status,
    });
    assert.doesNotMatch(blob, /password|apiKey|token|secret/i);
  });

  it("Test 15: multi-target sin AgentDefinition topology", async () => {
    const index = setupIndexMulti();
    const tools = new ToolRegistry();
    tools.register(
      fakeTool("demo.echo", async () => ({ ok: true, content: "x" })),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const result = await executor.execute({
      capabilityId: "demo.echo",
      input: {},
      context: { conversationId: "c1" },
    });
    assert.equal(result.status, "success");
    assert.equal(result.resolution?.executionTargetId, GATEWAY_TARGET_ID);
    // Agent only asked for capability id
    assert.equal(result.resolution?.capabilityId, "demo.echo");
  });

  it("bindToolsToCapabilityExecutor preserves ToolResult shape for Runtime", async () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "demo.echo" });
    index.registerImplementation({
      capabilityId: "demo.echo",
      toolName: "demo.echo",
      executionTargetId: "node-local",
      implementationKind: "native",
    });
    const tools = new ToolRegistry();
    tools.register(
      fakeTool("demo.echo", async () => ({ ok: true, content: 7 })),
    );
    const executor = createCapabilityExecutor({
      index,
      tools,
      policy: { "demo.echo": "automatic" },
    });
    const bound = bindToolsToCapabilityExecutor(tools, executor);
    const tool = bound.get("demo.echo")!;
    const result: ToolResult = await tool.execute(
      {},
      { conversationId: "c1", requestId: "cap_bound" },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.content, 7);
  });
});
