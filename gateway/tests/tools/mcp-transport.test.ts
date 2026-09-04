import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentMcpServer } from "../../../node/src/mcp/server.ts";
import { AGENT_ECHO } from "../../../node/src/tools/echo.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import {
  createConfirmationWaiter,
  type ConfirmationWaiter,
} from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type { LLMEvent, LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import {
  createMcpRemoteExecutor,
  MCP_TOOL_TIMEOUT_MS,
  REMOTE_TOOL_TIMEOUT_CODE,
  type McpCallToolClient,
} from "../../src/tools/mcp/executor.ts";
import { createRemoteAgentTool, REMOTE_TOOL_ERROR_CODE } from "../../src/tools/remote.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
    deviceId?: string;
  }> = [];

  return {
    ensureConversation(conversationId?: string): string {
      if (conversationId && conversations.has(conversationId)) {
        return conversationId;
      }
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content, deviceId): string {
      const id = `m_${randomUUID()}`;
      messages.push({ id, conversationId, role, content, deviceId });
      return id;
    },
    getHistory(conversationId): HistoryEntry[] {
      return messages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => ({ role: m.role, content: m.content }));
    },
  };
}

function createScriptedLLM(
  steps: Array<(request: LLMRequest) => LLMEvent[]>,
): LLMProvider {
  let index = 0;
  return {
    async *stream(request) {
      const step = steps[index];
      if (!step) throw new Error(`FakeLLM: no hay paso ${index}`);
      index += 1;
      for (const event of step(request)) yield event;
    },
  };
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

function lastToolResult(req: LLMRequest) {
  const last = req.messages[req.messages.length - 1];
  assert.ok(last && Array.isArray(last.content));
  const block = last.content.find((b) => b.type === "tool_result");
  assert.ok(block && block.type === "tool_result");
  return block;
}

async function startLoopback(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const mcpServer = createAgentMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "hub-mcp-spike", version: "0.1.0" });
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await mcpServer.close();
    },
  };
}

function countingClient(inner: McpCallToolClient): McpCallToolClient & {
  calls: number;
} {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    callTool: (params, schema, options) => {
      state.calls += 1;
      return inner.callTool(params, schema, options);
    },
  };
}

function createTestWaiter(timeoutMs = 5_000): ConfirmationWaiter {
  return createConfirmationWaiter({
    sessionId: "ws_mcp",
    deviceId: "device-1",
    timeoutMs,
  });
}

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
  onConfirm: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm(event);
  }
  return out;
}

describe("MCP transport spike Hub ↔ Agent", () => {
  it("Hub descubre agent.echo mediante MCP", async () => {
    const { client, close } = await startLoopback();
    try {
      const listed = await client.listTools();
      assert.ok(
        listed.tools.some((t) => t.name === AGENT_ECHO.name),
      );
      const echo = listed.tools.find((t) => t.name === AGENT_ECHO.name);
      assert.equal(echo?.description, AGENT_ECHO.description);
    } finally {
      await close();
    }
  });

  it("flujo FakeLLM → RemoteAgentTool → MCP → Agent echo → assistant_done", async () => {
    const { client, close } = await startLoopback();
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: AGENT_ECHO.name,
            description: AGENT_ECHO.description,
            inputSchema: { ...AGENT_ECHO.inputSchema },
            executionMode: "automatic",
          },
          executor,
        ),
      );

      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_echo",
            name: AGENT_ECHO.name,
            input: { text: "hello" },
          },
          { type: "done" },
        ],
        (req) => {
          const block = lastToolResult(req);
          assert.equal(block.toolCallId, "call_echo");
          assert.equal(block.isError, false);
          assert.match(block.content, /"text":"hello"/);
          return [
            { type: "text_delta", text: "Echo: hello" },
            { type: "done" },
          ];
        },
      ]);

      const runtime = createAgentRuntime({ memory, llm, tools });
      const events = await collect(
        runtime.runTurn({
          conversationId: "c_mcp",
          deviceId: "d1",
          userMessage: "repite hello",
        }),
      );

      assert.equal(counted.calls, 1);
      assert.deepEqual(
        events.filter((e) => e.type === "text_delta"),
        [{ type: "text_delta", text: "Echo: hello" }],
      );
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await close();
    }
  });

  it("MCP server caído → ToolResult remote_tool_error", async () => {
    const { client, close } = await startLoopback();
    await close();
    const executor = createMcpRemoteExecutor(client);
    const tool = createRemoteAgentTool(
      {
        name: AGENT_ECHO.name,
        description: AGENT_ECHO.description,
        inputSchema: { ...AGENT_ECHO.inputSchema },
        executionMode: "automatic",
      },
      executor,
    );
    const result = await tool.execute(
      { text: "x" },
      { conversationId: "c" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "agent_disconnected");
    }
  });

  it("timeout → remote_tool_timeout", async () => {
    assert.equal(typeof MCP_TOOL_TIMEOUT_MS, "number");
    assert.ok(MCP_TOOL_TIMEOUT_MS > 0);
    const hanging: McpCallToolClient = {
      callTool: () => new Promise(() => {}),
    };
    const executor = createMcpRemoteExecutor(hanging, { timeoutMs: 30 });
    const tool = createRemoteAgentTool(
      {
        name: AGENT_ECHO.name,
        description: AGENT_ECHO.description,
        inputSchema: { ...AGENT_ECHO.inputSchema },
        executionMode: "automatic",
      },
      executor,
    );
    const result = await tool.execute(
      { text: "x" },
      { conversationId: "c" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, REMOTE_TOOL_TIMEOUT_CODE);
      assert.equal(result.error.message, "Remote tool execution timed out");
    }
  });

  it("respuesta inválida → remote_tool_error", async () => {
    const fake: McpCallToolClient = {
      async callTool() {
        return {
          content: [{ type: "text" as const, text: "no-json" }],
        };
      },
    };
    const executor = createMcpRemoteExecutor(fake);
    const tool = createRemoteAgentTool(
      {
        name: AGENT_ECHO.name,
        description: AGENT_ECHO.description,
        inputSchema: { ...AGENT_ECHO.inputSchema },
        executionMode: "automatic",
      },
      executor,
    );
    const result = await tool.execute(
      { text: "x" },
      { conversationId: "c" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, REMOTE_TOOL_ERROR_CODE);
    }
  });

  it("tool inexistente → error controlado", async () => {
    const { client, close } = await startLoopback();
    try {
      const executor = createMcpRemoteExecutor(client);
      const tool = createRemoteAgentTool(
        {
          name: "test.remote.missing",
          description: "no existe en el Agent",
          inputSchema: { type: "object", properties: {} },
          executionMode: "automatic",
        },
        executor,
      );
      const result = await tool.execute({}, { conversationId: "c" });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "agent_tool_error");
      }
    } finally {
      await close();
    }
  });

  it("confirm ocurre ANTES de MCP; approve una llamada", async () => {
    const { client, close } = await startLoopback();
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: AGENT_ECHO.name,
            description: AGENT_ECHO.description,
            inputSchema: { ...AGENT_ECHO.inputSchema },
            executionMode: "confirm",
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_c",
            name: AGENT_ECHO.name,
            input: { text: "secret" },
          },
          { type: "done" },
        ],
        (req) => {
          const block = lastToolResult(req);
          assert.equal(block.isError, false);
          assert.match(block.content, /"text":"secret"/);
          return [{ type: "text_delta", text: "ok" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_conf",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "confirma mcp",
          confirmation: waiter.port,
        }),
        (req) => {
          assert.equal(counted.calls, 0);
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(counted.calls, 1);
    } finally {
      await close();
    }
  });

  it("confirm reject → cero llamadas MCP", async () => {
    const { client, close } = await startLoopback();
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: AGENT_ECHO.name,
            description: AGENT_ECHO.description,
            inputSchema: { ...AGENT_ECHO.inputSchema },
            executionMode: "confirm",
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_rj",
            name: AGENT_ECHO.name,
            input: { text: "no" },
          },
          { type: "done" },
        ],
        (req) => {
          const block = lastToolResult(req);
          assert.match(block.content, /confirmation_rejected/);
          return [{ type: "text_delta", text: "cancel" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "rechaza mcp",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, false);
        },
      );
      assert.equal(counted.calls, 0);
    } finally {
      await close();
    }
  });

  it("AgentRuntime no importa MCP SDK ni el executor MCP", () => {
    const runtimePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/agents/runtime.ts",
    );
    const src = readFileSync(runtimePath, "utf8");
    assert.doesNotMatch(src, /@modelcontextprotocol/);
    assert.doesNotMatch(src, /mcp-executor/);
    assert.doesNotMatch(src, /createMcpRemoteExecutor/);
    assert.doesNotMatch(src, /mcp-stdio/);
    assert.doesNotMatch(src, /InMemoryTransport/);
    assert.doesNotMatch(src, /net\.Socket/);
    assert.doesNotMatch(src, /createServer/);
  });

  it("mcp-executor.ts sí usa el SDK de MCP (lado Hub)", () => {
    const execPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/tools/mcp/executor.ts",
    );
    const src = readFileSync(execPath, "utf8");
    assert.match(src, /@modelcontextprotocol\/sdk/);
    assert.match(src, /MCP_TOOL_TIMEOUT_MS/);
  });
});
