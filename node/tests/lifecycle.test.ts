import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../src/lifecycle.ts";
import { AGENT_ECHO, agentEchoTool } from "../src/tools/echo.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import type { AgentTool } from "../src/tools/types.ts";

async function loopback() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT);
  const client = new Client({ name: "agent-test", version: "0.0.0" });
  await client.connect(clientT);
  return {
    agent,
    client,
    close: async () => {
      await client.close();
      await agent.shutdown();
    },
  };
}

function mcpText(mcp: unknown): string {
  assert.ok(mcp && typeof mcp === "object");
  const content = (mcp as { content?: unknown }).content;
  assert.ok(Array.isArray(content) && content.length > 0);
  const first = content[0] as { type?: unknown; text?: unknown };
  assert.equal(first.type, "text");
  assert.equal(typeof first.text, "string");
  return first.text as string;
}

describe("Agent lifecycle", () => {
  it("arranca y registra agent.echo", async () => {
    const registry = createDefaultToolRegistry();
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, registry);
    try {
      assert.equal(agent.started, true);
      assert.ok(registry.get(AGENT_ECHO.name));
      assert.equal(registry.get(AGENT_ECHO.name)?.executionMode, "automatic");
    } finally {
      await agent.shutdown();
      await clientT.close();
    }
  });

  it("shutdown es idempotente", async () => {
    const [, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    await agent.shutdown();
    await agent.shutdown();
    assert.equal(agent.started, false);
  });
});

describe("agent.echo", () => {
  it("input válido produce { text }", async () => {
    const result = await agentEchoTool.execute(
      { text: "hola" },
      { conversationId: "c" },
    );
    assert.deepEqual(result, { ok: true, content: { text: "hola" } });
  });

  it("input inválido genera ToolResult fail", async () => {
    const result = await agentEchoTool.execute(
      { nope: 1 },
      { conversationId: "c" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "invalid_input");
  });
});

describe("Agent MCP", () => {
  it("expone agent.echo mediante MCP", async () => {
    const { client, close } = await loopback();
    try {
      const listed = await client.listTools();
      const echo = listed.tools.find((t) => t.name === AGENT_ECHO.name);
      assert.ok(echo);
      assert.equal(echo.description, AGENT_ECHO.description);
    } finally {
      await close();
    }
  });

  it("MCP echo roundtrip", async () => {
    const { client, close } = await loopback();
    try {
      const mcp = await client.callTool({
        name: AGENT_ECHO.name,
        arguments: {
          requestId: "rt_test",
          context: { conversationId: "c1" },
          input: { text: "ping" },
        },
      });
      assert.equal(mcp.isError, undefined);
      const text = mcpText(mcp);
      const parsed = JSON.parse(text) as {
        requestId: string;
        result: { ok: boolean; content: { text: string } };
      };
      assert.equal(parsed.requestId, "rt_test");
      assert.deepEqual(parsed.result, { ok: true, content: { text: "ping" } });
    } finally {
      await close();
    }
  });

  it("error de tool no rompe el proceso", async () => {
    const boom: AgentTool = {
      name: "agent.boom",
      description: "lanza",
      inputSchema: { type: "object", properties: {} },
      executionMode: "automatic",
      async execute() {
        throw new Error("boom interno");
      },
    };
    const registry = new ToolRegistry();
    registry.register(boom);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, registry);
    const client = new Client({ name: "boom-test", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const mcp = await client.callTool({
        name: "agent.boom",
        arguments: {
          requestId: "rt_b",
          context: { conversationId: "c" },
          input: {},
        },
      });
      const text = mcpText(mcp);
      const parsed = JSON.parse(text) as {
        result: { ok: false; error: { code: string } };
      };
      assert.equal(parsed.result.ok, false);
      assert.equal(parsed.result.error.code, "tool_exception");
      assert.equal(agent.started, true);
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === "agent.boom"));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
