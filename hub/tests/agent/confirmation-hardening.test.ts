import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agent/runtime.ts";
import {
  createConfirmationWaiter,
  type ConfirmationWaiter,
} from "../../src/http/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool } from "../../src/tools/types.ts";

function createFakeMemory(): TurnMemory & {
  messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
    deviceId?: string;
  }>;
} {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
    deviceId?: string;
  }> = [];

  return {
    messages,
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
      if (!step) {
        throw new Error(`FakeLLM: no hay paso para la llamada ${index}`);
      }
      index += 1;
      for (const event of step(request)) {
        yield event;
      }
    },
  };
}

async function collect(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
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

function syncConfirmTool(
  name: string,
  run: (input: unknown) => { ok: true; content: unknown },
): AgentTool {
  return {
    name,
    description: "confirm tool",
    inputSchema: { type: "object", additionalProperties: true },
    executionMode: "confirm",
    async execute(input) {
      return run(input);
    },
  };
}

function makeWaiter(
  overrides: { sessionId?: string; deviceId?: string; timeoutMs?: number } = {},
): ConfirmationWaiter {
  return createConfirmationWaiter({
    sessionId: overrides.sessionId ?? "ws_hard",
    deviceId: overrides.deviceId ?? "device-1",
    timeoutMs: overrides.timeoutMs ?? 5_000,
  });
}

describe("6D confirmation hardening (runtime)", () => {
  it("CASO A: approve ejecuta input original exactamente una vez", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    const seen: unknown[] = [];
    tools.register(
      syncConfirmTool("test.confirm", (input) => {
        seen.push(input);
        return { ok: true, content: { seen: true } };
      }),
    );

    const waiter = makeWaiter();
    const originalInput = { path: "/safe", n: 1 };
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_a",
          name: "test.confirm",
          input: originalInput,
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.equal(block.isError, false);
        return [{ type: "text_delta", text: "ok" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_a",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "go",
        confirmation: waiter.port,
      }),
      (req) => {
        // Cliente intenta “alterar” mutando el objeto recibido: el pending ya congeló.
        (req.input as { path: string }).path = "/pwned";
        assert.equal(waiter.respond(req.confirmationId, true), true);
      },
    );

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], { path: "/safe", n: 1 });
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("CASO B: reject → cero ejecuciones + confirmation_rejected", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_b",
          name: "test.confirm",
          input: { x: 1 },
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.match(block.content, /confirmation_rejected/);
        return [{ type: "text_delta", text: "no" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_b",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "no",
        confirmation: waiter.port,
      }),
      (req) => {
        waiter.respond(req.confirmationId, false);
      },
    );
    assert.equal(executed, 0);
  });

  it("CASO C: timeout → cero ejecuciones + confirmation_timeout", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter({ timeoutMs: 25 });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_c",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.match(block.content, /confirmation_timeout/);
        return [{ type: "text_delta", text: "t" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await collect(
      runtime.runTurn({
        conversationId: "c_c",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "wait",
        confirmation: waiter.port,
      }),
    );
    assert.equal(executed, 0);
    assert.equal(waiter.respond("whatever", true), false);
  });

  it("CASO D: respuesta de otro confirmationId no aprueba A; A sigue pending hasta approve", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_d",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_d",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "d",
        confirmation: waiter.port,
      }),
      (req) => {
        assert.equal(waiter.respond("cf_other_B", true), false);
        assert.equal(waiter.hasPending(req.confirmationId), true);
        assert.equal(executed, 0);
        assert.equal(waiter.respond(req.confirmationId, true), true);
      },
    );
    assert.equal(executed, 1);
  });

  it("CASO E: cliente no puede cambiar input; execute usa el original", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executedInput: unknown;
    tools.register(
      syncConfirmTool("test.confirm", (input) => {
        executedInput = input;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_e",
          name: "test.confirm",
          input: { cmd: "echo safe" },
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_e",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "e",
        confirmation: waiter.port,
      }),
      (req) => {
        // Cualquier mutación del payload de confirm_request es irrelevante.
        (req as { toolName: string }).toolName = "evil.tool";
        (req.input as { cmd: string }).cmd = "rm -rf /";
        waiter.respond(req.confirmationId, true);
      },
    );
    assert.deepEqual(executedInput, { cmd: "echo safe" });
  });

  it("CASO F: cancelación (desconexión) + approve posterior no ejecuta", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_f",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.match(block.content, /confirmation_cancelled/);
        return [{ type: "text_delta", text: "x" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    let savedId = "";
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_f",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "f",
        confirmation: waiter.port,
      }),
      (req) => {
        savedId = req.confirmationId;
        // Simula dropSession / desconexión.
        waiter.cancelAll();
      },
    );
    assert.equal(executed, 0);
    // “Reconexión” con el mismo id antiguo.
    assert.equal(waiter.respond(savedId, true), false);
    assert.equal(executed, 0);
  });

  it("binding: deviceId incorrecto no ejecuta y pending permanece hasta cancel", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter({ deviceId: "device-1" });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_dev",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.match(block.content, /confirmation_cancelled/);
        return [{ type: "text_delta", text: "x" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_dev",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "dev",
        confirmation: waiter.port,
      }),
      (req) => {
        assert.equal(
          waiter.respond(req.confirmationId, true, {
            sessionId: waiter.sessionId,
            deviceId: "device-other",
          }),
          false,
        );
        assert.equal(waiter.hasPending(req.confirmationId), true);
        assert.equal(executed, 0);
        waiter.cancelAll();
      },
    );
    assert.equal(executed, 0);
  });

  it("binding: conversationId incorrecta no ejecuta", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_conv",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.match(block.content, /confirmation_cancelled/);
        return [{ type: "text_delta", text: "x" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_real",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "conv",
        confirmation: waiter.port,
      }),
      (req) => {
        assert.equal(
          waiter.respond(req.confirmationId, true, {
            sessionId: waiter.sessionId,
            deviceId: "device-1",
            conversationId: "c_other",
          }),
          false,
        );
        assert.equal(executed, 0);
        waiter.cancelAll();
      },
    );
    assert.equal(executed, 0);
  });

  it("approve después de timeout no ejecuta", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter({ timeoutMs: 20 });
    let confirmationId = "";
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_to",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "t" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_to",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "to",
        confirmation: waiter.port,
      }),
      (req) => {
        confirmationId = req.confirmationId;
        // No respondemos; dejamos timeout.
      },
    );
    assert.equal(executed, 0);
    assert.equal(waiter.respond(confirmationId, true), false);
    assert.equal(executed, 0);
  });

  it("doble approve concurrente → exactamente una ejecución", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_race",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_race",
        deviceId: "device-1",
        sessionId: waiter.sessionId,
        userMessage: "race",
        confirmation: waiter.port,
      }),
      (req) => {
        const a = waiter.respond(req.confirmationId, true);
        const b = waiter.respond(req.confirmationId, true);
        assert.equal([a, b].filter(Boolean).length, 1);
      },
    );
    assert.equal(executed, 1);
  });

  it("sin sessionId → fail-closed confirmation_unavailable", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(
      syncConfirmTool("test.confirm", () => {
        executed += 1;
        return { ok: true, content: {} };
      }),
    );
    const waiter = makeWaiter();
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_ns",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.match(block.content, /confirmation_unavailable/);
        return [{ type: "text_delta", text: "x" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({
        conversationId: "c_ns",
        deviceId: "device-1",
        // sin sessionId
        userMessage: "ns",
        confirmation: waiter.port,
      }),
    );
    assert.equal(executed, 0);
    assert.equal(
      events.some((e) => e.type === "confirm_request"),
      false,
    );
  });
});
