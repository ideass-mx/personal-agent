import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { AGENT_ECHO } from "../../../agent/src/tools/echo.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agent/runtime.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type { LLMEvent, LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp-executor.ts";
import { connectAgentStdioClient } from "../../src/tools/mcp-stdio.ts";
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

describe("Hub ↔ Agent proceso (stdio MCP)", () => {
  it("cliente Hub invoca agent.echo en el proceso Agent", async () => {
    const { client, close } = await connectAgentStdioClient();
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === AGENT_ECHO.name));

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
        { text: "proceso" },
        { conversationId: "c_stdio", deviceId: "d1" },
      );
      assert.deepEqual(result, { ok: true, content: { text: "proceso" } });
    } finally {
      await close();
    }
  });

  it("FakeLLM → AgentRuntime → Agent real → assistant_done", async () => {
    const { client, close } = await connectAgentStdioClient();
    try {
      let mcpCalls = 0;
      const counted = {
        callTool: (
          ...args: Parameters<typeof client.callTool>
        ) => {
          mcpCalls += 1;
          return client.callTool(...args);
        },
      };
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
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
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
          conversationId: "c_real",
          deviceId: "d1",
          userMessage: "repite hello",
        }),
      );

      assert.equal(mcpCalls, 1);
      assert.deepEqual(
        events.filter((e) => e.type === "text_delta"),
        [{ type: "text_delta", text: "Echo: hello" }],
      );
      const done = events.find((e) => e.type === "done");
      assert.ok(done);
    } finally {
      await close();
    }
  });

  it("cerrar Agent: error controlado y el Hub sigue", async () => {
    const { client, close } = await connectAgentStdioClient();
    const executor = createMcpRemoteExecutor(client);
    const remote = createRemoteAgentTool(
      {
        name: AGENT_ECHO.name,
        description: AGENT_ECHO.description,
        inputSchema: { ...AGENT_ECHO.inputSchema },
        executionMode: "automatic",
      },
      executor,
    );
    await close();

    const failed = await remote.execute(
      { text: "x" },
      { conversationId: "c" },
    );
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.error.code, "agent_disconnected");
    }

    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register({
      name: "test.add",
      description: "stub",
      inputSchema: { type: "object" },
      executionMode: "automatic",
      async execute() {
        return { ok: true, content: { result: 2 } };
      },
    });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "c1",
          name: "test.add",
          input: { a: 1, b: 1 },
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "2" }, { type: "done" }],
    ]);
    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({ userMessage: "1+1" }),
    );
    assert.ok(events.some((e) => e.type === "done"));
    assert.equal(events.some((e) => e.type === "error"), false);
  });
});
