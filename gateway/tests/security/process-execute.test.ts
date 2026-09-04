import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startLocalAgent } from "../../../node/src/lifecycle.ts";
import {
  PROCESS_EXECUTE,
  createProcessExecuteTool,
  mcpTimeoutMsForProcessExecute,
} from "../../../node/src/tools/process-execute.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import { createConfirmationWaiter } from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import { createRemoteAgentTool } from "../../src/tools/remote.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp/executor.ts";

const node = process.execPath;

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
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
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ id, conversationId, role, content });
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

function processScript(
  inner: ReturnType<typeof createProcessExecuteTool>,
  executes: { n: number },
) {
  return {
    ...inner,
    async execute(input: unknown, ctx: { conversationId: string }) {
      executes.n += 1;
      return inner.execute(input, ctx);
    },
  };
}

describe("8B process.execute confirmation + MCP", () => {
  it("approve: confirm_request → 1 MCP/spawn → done", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "hub-test", version: "0.0.0" });
    await client.connect(clientT);
    let mcpCalls = 0;
    const inner = createMcpRemoteExecutor(client);
    const executor = {
      execute: async (req: Parameters<typeof inner.execute>[0]) => {
        mcpCalls += 1;
        return inner.execute(req);
      },
    };
    const tools = new ToolRegistry();
    tools.register(
      createRemoteAgentTool(
        {
          name: PROCESS_EXECUTE.name,
          description: PROCESS_EXECUTE.description,
          inputSchema: PROCESS_EXECUTE.inputSchema,
          executionMode: "confirm",
          timeoutMsFor: mcpTimeoutMsForProcessExecute,
        },
        executor,
      ),
    );
    const waiter = createConfirmationWaiter({
      sessionId: "ws_ok",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const events = await runTurnCollecting(
        createAgentRuntime({
          memory: createFakeMemory(),
          llm: createScriptedLLM([
            () => [
              {
                type: "tool_call",
                id: "p1",
                name: PROCESS_EXECUTE.name,
                input: {
                  command: node,
                  args: ["-e", "process.stdout.write('ok')"],
                },
              },
              { type: "done" },
            ],
            () => [{ type: "text_delta", text: "listo" }, { type: "done" }],
          ]),
          tools,
        }).runTurn({
          conversationId: "c",
          sessionId: waiter.sessionId,
          deviceId: "d1",
          userMessage: "corre",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(mcpCalls, 1);
      assert.equal(events.some((e) => e.type === "confirm_request"), true);
      assert.equal(events.some((e) => e.type === "done"), true);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("reject: 0 MCP, 0 spawn, confirmation_rejected", async () => {
    const executes = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(
      processScript(createProcessExecuteTool(), executes),
    );
    const waiter = createConfirmationWaiter({
      sessionId: "ws_no",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    await runTurnCollecting(
      createAgentRuntime({
        memory: createFakeMemory(),
        llm: createScriptedLLM([
          () => [
            {
              type: "tool_call",
              id: "p1",
              name: PROCESS_EXECUTE.name,
              input: { command: node, args: ["-e", "process.exit(0)"] },
            },
            { type: "done" },
          ],
          (req) => {
            const last = req.messages[req.messages.length - 1];
            assert.ok(last && Array.isArray(last.content));
            const block = last.content.find((b) => b.type === "tool_result");
            assert.ok(block && block.type === "tool_result");
            assert.match(String(block.content), /confirmation_rejected/);
            return [{ type: "text_delta", text: "no" }, { type: "done" }];
          },
        ]),
        tools,
      }).runTurn({
        conversationId: "c",
        sessionId: waiter.sessionId,
        deviceId: "d1",
        userMessage: "corre",
        confirmation: waiter.port,
      }),
      (req) => {
        waiter.respond(req.confirmationId, false);
      },
    );
    assert.equal(executes.n, 0);
  });

  it("approve+reject concurrentes: como máximo 1 ejecución", async () => {
    const executes = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(
      processScript(createProcessExecuteTool(), executes),
    );
    const waiter = createConfirmationWaiter({
      sessionId: "ws_race",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    await runTurnCollecting(
      createAgentRuntime({
        memory: createFakeMemory(),
        llm: createScriptedLLM([
          () => [
            {
              type: "tool_call",
              id: "p1",
              name: PROCESS_EXECUTE.name,
              input: { command: node, args: ["-e", "0"] },
            },
            { type: "done" },
          ],
          () => [{ type: "text_delta", text: "x" }, { type: "done" }],
        ]),
        tools,
      }).runTurn({
        conversationId: "c",
        sessionId: waiter.sessionId,
        deviceId: "d1",
        userMessage: "corre",
        confirmation: waiter.port,
      }),
      (req) => {
        const a = waiter.respond(req.confirmationId, true);
        const b = waiter.respond(req.confirmationId, false);
        assert.equal([a, b].filter(Boolean).length, 1);
      },
    );
    assert.ok(executes.n <= 1);
  });

  it("approve después de timeout de confirm: 0 ejecución", async () => {
    const executes = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(
      processScript(createProcessExecuteTool(), executes),
    );
    const waiter = createConfirmationWaiter({
      sessionId: "ws_to",
      deviceId: "d1",
      timeoutMs: 30,
    });
    await runTurnCollecting(
      createAgentRuntime({
        memory: createFakeMemory(),
        llm: createScriptedLLM([
          () => [
            {
              type: "tool_call",
              id: "p1",
              name: PROCESS_EXECUTE.name,
              input: { command: node, args: ["-e", "0"] },
            },
            { type: "done" },
          ],
          () => [{ type: "text_delta", text: "x" }, { type: "done" }],
        ]),
        tools,
      }).runTurn({
        conversationId: "c",
        sessionId: waiter.sessionId,
        deviceId: "d1",
        userMessage: "corre",
        confirmation: waiter.port,
      }),
      () => {
        /* dejar timeout */
      },
    );
    assert.equal(waiter.respond("cf_stale", true), false);
    assert.equal(executes.n, 0);
  });

  it("cwd fuera de root: 0 spawn efectivo (ok:false) tras approve", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-8b-root-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outside = path.join(base, "out");
    await mkdir(outside);
    const executes = { n: 0 };
    const tools = new ToolRegistry();
    tools.register(
      processScript(createProcessExecuteTool({ root }), executes),
    );
    const waiter = createConfirmationWaiter({
      sessionId: "ws_cwd",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    await runTurnCollecting(
      createAgentRuntime({
        memory: createFakeMemory(),
        llm: createScriptedLLM([
          () => [
            {
              type: "tool_call",
              id: "p1",
              name: PROCESS_EXECUTE.name,
              input: {
                command: node,
                args: ["-e", "process.stdout.write('no')"],
                cwd: outside,
              },
            },
            { type: "done" },
          ],
          () => [{ type: "text_delta", text: "err" }, { type: "done" }],
        ]),
        tools,
      }).runTurn({
        conversationId: "c",
        sessionId: waiter.sessionId,
        deviceId: "d1",
        userMessage: "corre",
        confirmation: waiter.port,
      }),
      (req) => {
        waiter.respond(req.confirmationId, true);
      },
    );
    assert.equal(executes.n, 1);
  });
});
