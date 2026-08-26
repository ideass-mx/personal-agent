/**
 * 13B: Tool Policy del Hub autoriza tools descubiertas por MCP.
 * El Hub no importa implementaciones del Agent.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../agent/src/lifecycle.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agent/runtime.ts";
import { createConfirmationWaiter } from "../../src/http/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { HubAgentError } from "../../src/runtime/errors.ts";
import { registerDiscoveredAgentTools } from "../../src/tools/discover.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp-executor.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type {
  RemoteToolExecutor,
  RemoteToolRequest,
} from "../../src/tools/remote.ts";
import {
  DEFAULT_TOOL_POLICY,
  TOOL_POLICY_ERROR,
} from "../../src/tools/tool-policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ conversationId, role, content });
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

function countingExecutor(inner: RemoteToolExecutor): RemoteToolExecutor & {
  calls: RemoteToolRequest[];
} {
  const calls: RemoteToolRequest[] = [];
  return {
    calls,
    async execute(request) {
      calls.push(request);
      return inner.execute(request);
    },
  };
}

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
  onConfirm?: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm?.(event);
  }
  return out;
}

async function openLoop(
  policy: unknown = DEFAULT_TOOL_POLICY,
): Promise<{
  agent: Awaited<ReturnType<typeof startLocalAgent>>;
  client: Client;
  tools: ToolRegistry;
  names: string[];
  executor: RemoteToolExecutor & { calls: RemoteToolRequest[] };
  close: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "pa-13b-"));
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT, {
    config: { filesystem: { root } },
  });
  const client = new Client({ name: "hub-13b", version: "0.0.0" });
  await client.connect(clientT);
  const inner = createMcpRemoteExecutor(client);
  const executor = countingExecutor(inner);
  const tools = new ToolRegistry();
  try {
    const names = await registerDiscoveredAgentTools(tools, client, executor, {
      policy,
    });
    return {
      agent,
      client,
      tools,
      names,
      executor,
      close: async () => {
        await client.close();
        await agent.shutdown();
      },
    };
  } catch (err) {
    await client.close().catch(() => undefined);
    await agent.shutdown().catch(() => undefined);
    throw err;
  }
}

describe("13B Hub Tool Policy E2E", () => {
  it("A: diagnostics.ping autorizada automatic → 0 confirm, 1 MCP", async () => {
    const loop = await openLoop();
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ping",
            name: "diagnostics.ping",
            input: {},
          },
        ],
        () => [{ type: "text_delta", text: "pong" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_a",
          userMessage: "ping",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "diagnostics.ping");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("B: customer.test anunciada sin policy → no se registra, 0 MCP", async () => {
    const loop = await openLoop();
    try {
      const listed = await loop.client.listTools();
      assert.ok(listed.tools.some((t) => t.name === "customer.test"));
      assert.equal(loop.names.includes("customer.test"), false);
      assert.equal(loop.tools.get("customer.test"), undefined);

      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ct",
            name: "customer.test",
            input: { message: "x" },
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, true);
          return [{ type: "text_delta", text: "no" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_b",
          userMessage: "test",
        }),
      );
      assert.equal(loop.executor.calls.length, 0);
    } finally {
      await loop.close();
    }
  });

  it("C/G: customer.test se habilita solo con entrada de policy, sin cambiar discover.ts", async () => {
    const discover = readFileSync(
      path.join(repoRoot, "hub/src/tools/discover.ts"),
      "utf8",
    );
    assert.doesNotMatch(discover, /customer\.test/);
    const loop = await openLoop({
      ...DEFAULT_TOOL_POLICY,
      "customer.test": "confirm",
    });
    try {
      assert.ok(loop.names.includes("customer.test"));
      assert.equal(loop.tools.get("customer.test")?.executionMode, "confirm");
      const waiter = createConfirmationWaiter({
        sessionId: "ws_c",
        deviceId: "d1",
        timeoutMs: 5_000,
      });
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ct",
            name: "customer.test",
            input: { message: "hola" },
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, false);
          const parsed = JSON.parse(resultBlock.content) as {
            customer: string;
            message: string;
          };
          assert.deepEqual(parsed, { customer: "test", message: "hola" });
          return [{ type: "text_delta", text: "ok" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_c",
          deviceId: "d1",
          sessionId: "ws_c",
          userMessage: "test",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 1);
    } finally {
      await loop.close();
    }
  });

  it("D: reject de customer.test → 0 MCP", async () => {
    const loop = await openLoop({
      ...DEFAULT_TOOL_POLICY,
      "customer.test": "confirm",
    });
    const waiter = createConfirmationWaiter({
      sessionId: "ws_d",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ct",
            name: "customer.test",
            input: { message: "no" },
          },
        ],
        () => [{ type: "text_delta", text: "cancelado" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_d",
          deviceId: "d1",
          sessionId: "ws_d",
          userMessage: "test",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, false);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 0);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("F: policy de tool inexistente aborta discovery (no READY)", async () => {
    await assert.rejects(
      () =>
        openLoop({
          ...DEFAULT_TOOL_POLICY,
          "does.not.exist": "automatic",
        }),
      (err: unknown) =>
        err instanceof HubAgentError && err.code === TOOL_POLICY_ERROR,
    );
  });

  it("I: Agent.executionMode confirm + Hub automatic → 0 confirm", async () => {
    const loop = await openLoop({
      ...DEFAULT_TOOL_POLICY,
      "customer.test": "automatic",
    });
    try {
      assert.equal(loop.tools.get("customer.test")?.executionMode, "automatic");
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ct",
            name: "customer.test",
            input: { message: "auto" },
          },
        ],
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_i_auto",
          userMessage: "test",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
    } finally {
      await loop.close();
    }
  });

  it("I: Agent.executionMode automatic + Hub confirm → confirmation", async () => {
    const loop = await openLoop({
      ...DEFAULT_TOOL_POLICY,
      "math.add": "confirm",
    });
    const waiter = createConfirmationWaiter({
      sessionId: "ws_i",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      assert.equal(loop.tools.get("math.add")?.executionMode, "confirm");
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_add",
            name: "math.add",
            input: { a: 1, b: 2 },
          },
        ],
        () => [{ type: "text_delta", text: "3" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_i_confirm",
          deviceId: "d1",
          sessionId: "ws_i",
          userMessage: "suma",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 1);
    } finally {
      await loop.close();
    }
  });

  it("H: Hub src no importa agent/src/extensions ni agent/src/tools", () => {
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /agent\/src\/extensions/, file);
      assert.doesNotMatch(text, /agent\/src\/tools/, file);
    }
  });
});
