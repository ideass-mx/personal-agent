/**
 * 8D: FakeLLM → AgentRuntime → confirm → RemoteAgentTool → MCP → Agent.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../node/src/lifecycle.ts";
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
import { registerDiscoveredAgentTools } from "../../src/tools/discover.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp/executor.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type {
  RemoteToolExecutor,
  RemoteToolRequest,
} from "../../src/tools/remote.ts";

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

async function openAgentLoop(root: string) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT, {
    config: { filesystem: { root } },
  });
  const client = new Client({ name: "hub-8d", version: "0.0.0" });
  await client.connect(clientT);
  const inner = createMcpRemoteExecutor(client);
  const executor = countingExecutor(inner);
  const tools = new ToolRegistry();
  const names = await registerDiscoveredAgentTools(tools, client, executor);
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
}

describe("8D E2E FakeLLM ↔ Hub ↔ MCP ↔ Agent", () => {
  it("descubre tools del Agent por MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-disc-"));
    const loop = await openAgentLoop(root);
    try {
      assert.ok(loop.names.includes("filesystem.read"));
      assert.ok(loop.names.includes("filesystem.list"));
      assert.ok(loop.names.includes("filesystem.write"));
      assert.ok(loop.names.includes("process.execute"));
      assert.ok(loop.names.includes("agent.echo"));
      assert.ok(loop.names.includes("math.add"));
      assert.ok(loop.names.includes("math.subtract"));
      assert.ok(loop.names.includes("math.multiply"));
      assert.ok(loop.names.includes("math.divide"));
      assert.ok(loop.names.includes("system.info"));
      assert.ok(loop.names.includes("diagnostics.ping"));
      assert.ok(loop.names.includes("customer.demo"));
      assert.ok(loop.names.includes("office.excel.read"));
      assert.equal(loop.tools.get("office.excel.read")?.executionMode, "automatic");
      assert.ok(loop.names.includes("office.excel.write"));
      assert.equal(loop.tools.get("office.excel.write")?.executionMode, "confirm");
      assert.equal(loop.names.includes("customer.test"), false);
      assert.equal(loop.tools.get("customer.test"), undefined);
      assert.equal(loop.tools.get("agent.echo")?.executionMode, "automatic");
      assert.equal(loop.tools.get("customer.demo")?.executionMode, "automatic");
      assert.equal(loop.tools.get("math.add")?.executionMode, "automatic");
      assert.equal(loop.tools.get("math.subtract")?.executionMode, "automatic");
      assert.equal(loop.tools.get("math.multiply")?.executionMode, "automatic");
      assert.equal(loop.tools.get("math.divide")?.executionMode, "automatic");
      assert.equal(loop.tools.get("system.info")?.executionMode, "automatic");
      assert.equal(loop.tools.get("diagnostics.ping")?.executionMode, "automatic");
      assert.equal(loop.tools.get("filesystem.read")?.executionMode, "automatic");
      assert.equal(loop.tools.get("filesystem.list")?.executionMode, "automatic");
      assert.equal(loop.tools.get("filesystem.write")?.executionMode, "confirm");
      assert.equal(loop.tools.get("process.execute")?.executionMode, "confirm");
    } finally {
      await loop.close();
    }
  });

  it("A: filesystem.read automatic → 0 confirm, 1 MCP, done", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-a-"));
    await writeFile(path.join(root, "nota.txt"), "hola 8d", "utf8");
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_r",
            name: "filesystem.read",
            input: { path: "nota.txt" },
          },
        ],
        () => [{ type: "text_delta", text: "leído" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_a",
          deviceId: "d1",
          sessionId: "ws_a",
          userMessage: "lee nota",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "filesystem.read");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("B: filesystem.write approve → 1 confirm, 1 MCP, 1 write", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-b-"));
    const loop = await openAgentLoop(root);
    const waiter = createConfirmationWaiter({
      sessionId: "ws_b",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: "filesystem.write",
            input: { path: "out.txt", content: "escrito" },
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
          conversationId: "c_b",
          deviceId: "d1",
          sessionId: "ws_b",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 1);
      const written = await readFile(path.join(root, "out.txt"), "utf8");
      assert.equal(written, "escrito");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("C: filesystem.write reject → confirmation_rejected, 0 MCP, 0 writes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-c-"));
    const loop = await openAgentLoop(root);
    const waiter = createConfirmationWaiter({
      sessionId: "ws_c",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    const dumped: string[] = [];
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: "filesystem.write",
            input: { path: "nope.txt", content: "x" },
          },
        ],
        (req) => {
          dumped.push(JSON.stringify(req.messages.at(-1)));
          return [{ type: "text_delta", text: "cancelado" }, { type: "done" }];
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
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, false);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 0);
      await assert.rejects(readFile(path.join(root, "nope.txt")));
      assert.match(dumped.join(""), /confirmation_rejected/);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("D: process.execute approve → 1 confirm, 1 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-d-"));
    const loop = await openAgentLoop(root);
    const waiter = createConfirmationWaiter({
      sessionId: "ws_d",
      deviceId: "d1",
      timeoutMs: 8_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_p",
            name: "process.execute",
            input: {
              command: process.execPath,
              args: ["-e", "process.stdout.write('8d')"],
            },
          },
        ],
        () => [{ type: "text_delta", text: "ran" }, { type: "done" }],
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
          userMessage: "ejecuta",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "process.execute");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("E: process.execute reject → 0 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-8d-e-"));
    const loop = await openAgentLoop(root);
    const waiter = createConfirmationWaiter({
      sessionId: "ws_e",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_p",
            name: "process.execute",
            input: {
              command: process.execPath,
              args: ["-e", "process.exit(0)"],
            },
          },
        ],
        () => [{ type: "text_delta", text: "no" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_e",
          deviceId: "d1",
          sessionId: "ws_e",
          userMessage: "ejecuta",
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

  it("L: FakeLLM → agent.echo (extensión) → 0 confirm, 1 MCP, done", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-10a-echo-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_e",
            name: "agent.echo",
            input: { text: "hola 10a" },
          },
        ],
        () => [{ type: "text_delta", text: "eco" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_echo",
          userMessage: "echo",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "agent.echo");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("10C D: FakeLLM → math.add(2,3) → 5, 0 confirm, 1 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-10c-add-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_add",
            name: "math.add",
            input: { a: 2, b: 3 },
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, false);
          assert.match(resultBlock.content, /"result":5/);
          return [{ type: "text_delta", text: "5" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_math_add",
          userMessage: "suma 2 y 3",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "math.add");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("10C E: FakeLLM → math.subtract(10,4) → 6, 0 confirm, 1 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-10c-sub-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_sub",
            name: "math.subtract",
            input: { a: 10, b: 4 },
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.match(resultBlock.content, /"result":6/);
          return [{ type: "text_delta", text: "6" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_math_sub",
          userMessage: "resta 4 de 10",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "math.subtract");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("2.4: FakeLLM → math.divide(10,2) → 5 vía MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-24-div-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_div",
            name: "math.divide",
            input: { a: 10, b: 2 },
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, false);
          assert.match(resultBlock.content, /"result":5/);
          return [{ type: "text_delta", text: "5" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_math_div",
          userMessage: "divide 10 entre 2",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "math.divide");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("11B: FakeLLM → system.info → 0 confirm, 1 MCP, sin spawn/fs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-11b-sys-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_sys",
            name: "system.info",
            input: {},
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, false);
          const parsed = JSON.parse(resultBlock.content) as {
            platform: string;
            arch: string;
            nodeVersion: string;
            pid: number;
          };
          assert.equal(typeof parsed.platform, "string");
          assert.equal(typeof parsed.arch, "string");
          assert.equal(typeof parsed.nodeVersion, "string");
          assert.equal(typeof parsed.pid, "number");
          assert.equal(parsed.platform, process.platform);
          assert.equal(parsed.arch, process.arch);
          assert.equal(parsed.nodeVersion, process.version);
          return [{ type: "text_delta", text: parsed.platform }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_system_info",
          userMessage: "info del sistema",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "system.info");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("11C: FakeLLM → diagnostics.ping → pong, 0 confirm, 1 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-11c-diag-"));
    const loop = await openAgentLoop(root);
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
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, false);
          const parsed = JSON.parse(resultBlock.content) as { pong: boolean };
          assert.equal(parsed.pong, true);
          return [{ type: "text_delta", text: "pong" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_diagnostics_ping",
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

  it("13A: FakeLLM → customer.demo → ToolResult, 0 confirm, 1 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13a-cust-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_cust",
            name: "customer.demo",
            input: { message: "hola cliente" },
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
          assert.deepEqual(parsed, {
            customer: "demo",
            message: "hola cliente",
          });
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
          conversationId: "c_customer_demo",
          userMessage: "saluda",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "customer.demo");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("10C H: tool desconocida fail-closed, 0 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-10c-miss-"));
    const loop = await openAgentLoop(root);
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_miss",
            name: "math.pow",
            input: { a: 2, b: 3 },
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
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_math_miss",
          userMessage: "multiplica",
        }),
      );
      assert.equal(loop.executor.calls.length, 0);
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });
});
