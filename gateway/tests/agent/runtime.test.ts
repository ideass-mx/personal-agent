import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createAgentRuntime,
  MAX_TOOL_ITERATIONS,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import { AgentDiagnosticError } from "../../src/diagnostics/error.ts";
import {
  createConfirmationWaiter,
  type ConfirmationWaiter,
} from "../../src/sessions/confirmation-waiter.ts";
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

function emptyTools(): ToolRegistry {
  return new ToolRegistry();
}

/** Stub de test para el loop LLM; no es una Tool de producción. */
function testAddTool(): AgentTool {
  return {
    name: "test.add",
    description: "Suma de prueba",
    inputSchema: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
    },
    executionMode: "automatic",
    async execute(input) {
      const rec = input as { a?: number; b?: number };
      if (typeof rec.a !== "number" || typeof rec.b !== "number") {
        return {
          ok: false,
          error: { code: "invalid_input", message: "a y b" },
        };
      }
      return { ok: true, content: { result: rec.a + rec.b } };
    },
  };
}

/** Fake LLM con guion por llamada (soporta tool calling). */
function createScriptedLLM(
  steps: Array<(request: LLMRequest) => LLMEvent[]>,
  onEach?: (request: LLMRequest, index: number) => void,
): LLMProvider {
  let index = 0;
  return {
    async *stream(request) {
      onEach?.(request, index);
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

function createConfirmTool(
  execute: AgentTool["execute"],
): AgentTool {
  return {
    name: "test.confirm",
    description: "Tool de prueba que requiere confirmación",
    inputSchema: {
      type: "object",
      properties: { x: { type: "number" } },
      additionalProperties: false,
    },
    executionMode: "confirm",
    execute,
  };
}

function syncConfirmTool(
  run: () => { ok: true; content: unknown },
): AgentTool {
  return createConfirmTool(async () => run());
}

function createTestWaiter(timeoutMs = 5_000): ConfirmationWaiter {
  return createConfirmationWaiter({
    sessionId: "ws_test",
    deviceId: "device-1",
    timeoutMs,
  });
}

/**
 * Recorre el generador del turno; ante confirm_request invoca onConfirm
 * (el pending ya está registrado porque wait() corre antes del yield).
 */
async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
  _waiter: ConfirmationWaiter,
  onConfirm: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") {
      onConfirm(event);
    }
  }
  return out;
}

describe("AgentRuntime.runTurn (texto)", () => {
  it("funciona con FakeLLMProvider: text_delta, persistencia y done", async () => {
    const memory = createFakeMemory();
    const requests: LLMRequest[] = [];
    const llm = createScriptedLLM(
      [
        () => [
          { type: "text_delta", text: "Hola" },
          { type: "text_delta", text: " mundo" },
          { type: "done" },
        ],
      ],
      (req) => requests.push(req),
    );

    const runtime = createAgentRuntime({
      memory,
      llm,
      tools: emptyTools(),
    });
    const events = await collect(
      runtime.runTurn({
        conversationId: "c_test",
        deviceId: "device-1",
        userMessage: "saluda",
      }),
    );

    assert.equal(memory.messages[0]?.role, "user");
    assert.equal(memory.messages[0]?.content, "saluda");
    assert.deepEqual(requests[0]?.messages, [
      { role: "user", content: "saluda" },
    ]);
    assert.deepEqual(
      events.filter((e) => e.type === "text_delta"),
      [
        { type: "text_delta", text: "Hola" },
        { type: "text_delta", text: " mundo" },
      ],
    );
    const assistant = memory.messages.find((m) => m.role === "assistant");
    assert.ok(assistant);
    assert.equal(assistant.content, "Hola mundo");
    const done = events.find((e) => e.type === "done");
    assert.ok(done && done.type === "done");
    assert.equal(done.messageId, assistant.id);
  });

  it("pasa al LLMProvider el historial completo de la conversación", async () => {
    const memory = createFakeMemory();
    memory.ensureConversation("c_hist");
    memory.addMessage("c_hist", "user", "primero");
    memory.addMessage("c_hist", "assistant", "respuesta 1");

    let received: LLMRequest | undefined;
    const llm = createScriptedLLM(
      [() => [{ type: "text_delta", text: "ok" }, { type: "done" }]],
      (req) => {
        received = req;
      },
    );

    const runtime = createAgentRuntime({
      memory,
      llm,
      tools: emptyTools(),
    });
    await collect(
      runtime.runTurn({
        conversationId: "c_hist",
        userMessage: "segundo",
      }),
    );

    assert.deepEqual(received?.messages, [
      { role: "user", content: "primero" },
      { role: "assistant", content: "respuesta 1" },
      { role: "user", content: "segundo" },
    ]);
  });

  it("convierte errores del LLMProvider en evento error sin done", async () => {
    const memory = createFakeMemory();
    const llm: LLMProvider = {
      async *stream() {
        yield { type: "text_delta", text: "parcial" };
        throw new Error("boom provider");
      },
    };

    const runtime = createAgentRuntime({
      memory,
      llm,
      tools: emptyTools(),
    });
    const events = await collect(runtime.runTurn({ userMessage: "hola" }));

    assert.ok(events.some((e) => e.type === "text_delta"));
    assert.ok(events.some((e) => e.type === "error"));
    assert.equal(events.some((e) => e.type === "done"), false);
    const error = events.find((e) => e.type === "error");
    assert.ok(error && error.type === "error");
    assert.equal(error.diagnostic?.errorCode, "AGENT_RUNTIME_FAILED");
    assert.match(error.diagnostic?.diagnosticId || "", /^PA-/);
  });

  it("propaga diagnosticId cuando el provider clasifica un error", async () => {
    const memory = createFakeMemory();
    const llm: LLMProvider = {
      async *stream() {
        throw new AgentDiagnosticError({
          message: "invalid x-api-key",
          component: "LLM_PROVIDER",
          stage: "LLM_REQUEST",
          errorCode: "LLM_AUTH_FAILED",
          diagnosticId: "PA-ABC123",
          httpStatus: 401,
          metadata: { provider: "anthropic" },
        });
      },
    };
    const runtime = createAgentRuntime({
      memory,
      llm,
      tools: emptyTools(),
    });
    const events = await collect(runtime.runTurn({ userMessage: "hola" }));
    const error = events.find((e) => e.type === "error");
    assert.ok(error && error.type === "error");
    assert.equal(error.diagnostic?.diagnosticId, "PA-ABC123");
    assert.equal(error.diagnostic?.errorCode, "LLM_AUTH_FAILED");
    assert.equal(error.diagnostic?.component, "LLM_PROVIDER");
    assert.equal(error.diagnostic?.httpStatus, 401);
  });

  it("crea conversación nueva si no se envía conversationId", async () => {
    const memory = createFakeMemory();
    const llm = createScriptedLLM([
      () => [{ type: "text_delta", text: "x" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({
      memory,
      llm,
      tools: emptyTools(),
    });
    const events = await collect(runtime.runTurn({ userMessage: "nuevo" }));
    const done = events.find((e) => e.type === "done");
    assert.ok(done && done.type === "done");
    assert.match(done.conversationId, /^c_/);
  });
});

describe("AgentRuntime tool calling", () => {
  it("ciclo LLM → tool_call → tool_result → LLM → texto final", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register(testAddTool());

    const requests: LLMRequest[] = [];
    const llm = createScriptedLLM(
      [
        () => [
          {
            type: "tool_call",
            id: "call_1",
            name: "test.add",
            input: { a: 2, b: 3 },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find(
            (b) => b.type === "tool_result",
          );
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.toolCallId, "call_1");
          assert.equal(resultBlock.isError, false);
          assert.match(resultBlock.content, /"result":5/);

          return [
            { type: "text_delta", text: "Son 5." },
            { type: "done" },
          ];
        },
      ],
      (req) => requests.push(structuredClone(req)),
    );

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({
        conversationId: "c_calc",
        deviceId: "d1",
        userMessage: "cuánto es 2+3",
      }),
    );

    assert.equal(requests.length, 2);
    assert.ok(requests[0]?.tools?.some((t) => t.name === "test_add"));
    assert.ok(
      !requests[0]?.tools?.some((t) => "execute" in (t as object)),
    );
    assert.ok(
      !requests[0]?.tools?.some((t) => "executionMode" in (t as object)),
    );

    assert.deepEqual(
      events.filter((e) => e.type === "text_delta"),
      [{ type: "text_delta", text: "Son 5." }],
    );
    const assistant = memory.messages.find((m) => m.role === "assistant");
    assert.ok(assistant);
    assert.equal(assistant.content, "Son 5.");
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("normaliza nombres de tools para el provider y los revierte al ejecutar", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = false;
    tools.register({
      name: "filesystem.read",
      description: "Lee un archivo",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      executionMode: "automatic",
      async execute(input) {
        executed = true;
        assert.deepEqual(input, { path: "nota.txt" });
        return { ok: true, content: { text: "hola" } };
      },
    });
    const requests: LLMRequest[] = [];
    const llm = createScriptedLLM(
      [
        (req) => {
          requests.push(req);
          assert.equal(req.tools?.[0]?.name, "filesystem_read");
          return [
            {
              type: "tool_call",
              id: "call_read",
              name: "filesystem_read",
              input: { path: "nota.txt" },
            },
            { type: "done" },
          ];
        },
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ],
    );
    const runtime = createAgentRuntime({
      memory,
      llm,
      tools,
    });
    const events = await collect(runtime.runTurn({ userMessage: "lee la nota" }));
    assert.equal(executed, true);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("automatic ejecuta inmediatamente sin confirm_request", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register({
      name: "test.auto",
      description: "automatic",
      inputSchema: { type: "object", properties: {} },
      executionMode: "automatic",
      async execute() {
        executed += 1;
        return { ok: true, content: { ran: true } };
      },
    });

    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_a",
          name: "test.auto",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({ userMessage: "auto" }),
    );

    assert.equal(executed, 1);
    assert.equal(
      events.some((e) => e.type === "confirm_request"),
      false,
    );
    const progress = events.filter((e) => e.type === "tool_progress");
    assert.equal(progress.length, 2);
    assert.equal(progress[0]?.phase, "executing");
    assert.equal(progress[0]?.toolName, "test.auto");
    assert.equal(progress[1]?.phase, "completed");
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("confirm: approve ejecuta exactamente una vez y tool_result vuelve al LLM", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(syncConfirmTool(() => {
      executed += 1;
      return { ok: true, content: { once: true } };
    }));

    const waiter = createTestWaiter(5_000);
    let sawSuccessResult = false;
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_1",
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
        assert.equal(block.toolCallId, "call_1");
        assert.equal(block.isError, false);
        assert.match(block.content, /"once":true/);
        sawSuccessResult = true;
        return [
          { type: "text_delta", text: "Hecho." },
          { type: "done" },
        ];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await runTurnCollecting(
      runtime.runTurn({
        conversationId: "c_ok",
        sessionId: waiter.sessionId,
        deviceId: "device-1",
        userMessage: "confirma",
        confirmation: waiter.port,
      }),
      waiter,
      (req) => {
        assert.equal(executed, 0);
        assert.equal(req.toolCallId, "call_1");
        assert.equal(req.toolName, "test.confirm");
        assert.deepEqual(req.input, { x: 1 });
        assert.equal(waiter.respond(req.confirmationId, true), true);
      },
    );

    assert.equal(executed, 1);
    assert.equal(sawSuccessResult, true);
    assert.ok(events.some((e) => e.type === "confirm_request"));
    const assistant = memory.messages.find((m) => m.role === "assistant");
    assert.ok(assistant);
    assert.equal(assistant.content, "Hecho.");
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("confirm: reject no ejecuta y genera confirmation_rejected; el loop continúa", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(syncConfirmTool(() => {
      executed += 1;
      return { ok: true, content: {} };
    }));

    const waiter = createTestWaiter(5_000);
    let sawRejected = false;
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_r",
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
        assert.equal(block.isError, true);
        assert.match(block.content, /confirmation_rejected/);
        sawRejected = true;
        return [
          { type: "text_delta", text: "Cancelado." },
          { type: "done" },
        ];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await runTurnCollecting(
      runtime.runTurn({
        sessionId: waiter.sessionId,
        deviceId: "device-1",
        userMessage: "rechaza",
        confirmation: waiter.port,
      }),
      waiter,
      (req) => {
        assert.equal(waiter.respond(req.confirmationId, false), true);
      },
    );

    assert.equal(executed, 0);
    assert.equal(sawRejected, true);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("confirm: timeout no ejecuta", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(syncConfirmTool(() => {
      executed += 1;
      return { ok: true, content: {} };
    }));

    const waiter = createTestWaiter(30);
    let sawTimeout = false;
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_t",
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
        sawTimeout = true;
        return [{ type: "text_delta", text: "timeout" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({
        sessionId: waiter.sessionId,
        deviceId: "device-1",
        userMessage: "espera",
        confirmation: waiter.port,
      }),
    );

    assert.equal(executed, 0);
    assert.equal(sawTimeout, true);
    assert.ok(events.some((e) => e.type === "confirm_request"));
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("confirm: confirmationId incorrecto no ejecuta; cancelación tampoco", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(syncConfirmTool(() => {
      executed += 1;
      return { ok: true, content: {} };
    }));

    const waiter = createTestWaiter(5_000);
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_b",
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
        return [{ type: "text_delta", text: "cancel" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await runTurnCollecting(
      runtime.runTurn({
        sessionId: waiter.sessionId,
        deviceId: "device-1",
        userMessage: "bad id",
        confirmation: waiter.port,
      }),
      waiter,
      (req) => {
        assert.equal(waiter.respond("cf_wrong_id", true), false);
        assert.equal(executed, 0);
        // Respuesta duplicada después de cancel tampoco ejecuta.
        waiter.cancelAll();
        assert.equal(waiter.respond(req.confirmationId, true), false);
      },
    );

    assert.equal(executed, 0);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("confirm: respuesta duplicada no ejecuta dos veces", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(syncConfirmTool(() => {
      executed += 1;
      return { ok: true, content: { n: executed } };
    }));

    const waiter = createTestWaiter(5_000);
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
        sessionId: waiter.sessionId,
        deviceId: "device-1",
        userMessage: "dup",
        confirmation: waiter.port,
      }),
      waiter,
      (req) => {
        assert.equal(waiter.respond(req.confirmationId, true), true);
        assert.equal(waiter.respond(req.confirmationId, true), false);
      },
    );

    assert.equal(executed, 1);
  });

  it("confirm puede aparecer en una iteración posterior del loop", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register(testAddTool());
    let confirmExecuted = 0;
    tools.register(syncConfirmTool(() => {
      confirmExecuted += 1;
      return { ok: true, content: { ok: true } };
    }));

    const waiter = createTestWaiter(5_000);
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_calc",
          name: "test.add",
          input: { a: 1, b: 1 },
        },
        { type: "done" },
      ],
      () => [
        {
          type: "tool_call",
          id: "call_c2",
          name: "test.confirm",
          input: {},
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "listo" }, { type: "done" }],
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await runTurnCollecting(
      runtime.runTurn({
        sessionId: waiter.sessionId,
        deviceId: "device-1",
        userMessage: "luego confirma",
        confirmation: waiter.port,
      }),
      waiter,
      (req) => {
        assert.equal(req.toolName, "test.confirm");
        waiter.respond(req.confirmationId, true);
      },
    );

    assert.equal(confirmExecuted, 1);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("confirm sin ConfirmationPort no ejecuta (fail-closed)", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    let executed = 0;
    tools.register(syncConfirmTool(() => {
      executed += 1;
      return { ok: true, content: {} };
    }));

    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_u",
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
        return [{ type: "text_delta", text: "no" }, { type: "done" }];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({ userMessage: "sin puerto" }),
    );

    assert.equal(executed, 0);
    assert.equal(
      events.some((e) => e.type === "confirm_request"),
      false,
    );
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("tool inexistente se convierte en tool_result de error y el LLM puede continuar", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register(testAddTool());

    let sawErrorResult = false;
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_x",
          name: "no_existe",
          input: {},
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.equal(block.isError, true);
        assert.match(block.content, /tool_not_found/);
        sawErrorResult = true;
        return [
          { type: "text_delta", text: "No pude usar esa tool." },
          { type: "done" },
        ];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({ userMessage: "usa no_existe" }),
    );

    assert.equal(sawErrorResult, true);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("error de tool (división entre cero) vuelve al LLM como tool_result", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register({
      name: "test.div",
      description: "divide stub",
      inputSchema: { type: "object" },
      executionMode: "automatic",
      async execute() {
        return {
          ok: false,
          error: {
            code: "division_by_zero",
            message: "No se puede dividir entre cero.",
          },
        };
      },
    });

    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_div",
          name: "test.div",
          input: { a: 1, b: 0 },
        },
        { type: "done" },
      ],
      (req) => {
        const last = req.messages[req.messages.length - 1];
        assert.ok(last && Array.isArray(last.content));
        const block = last.content.find((b) => b.type === "tool_result");
        assert.ok(block && block.type === "tool_result");
        assert.equal(block.isError, true);
        assert.match(block.content, /division_by_zero/);
        return [
          { type: "text_delta", text: "No se puede dividir entre cero." },
          { type: "done" },
        ];
      },
    ]);

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({ userMessage: "1/0" }),
    );
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("MAX_TOOL_ITERATIONS evita loop infinito de tool_call", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register(testAddTool());

    let calls = 0;
    const llm: LLMProvider = {
      async *stream() {
        calls += 1;
        yield {
          type: "tool_call",
          id: `call_${calls}`,
          name: "test.add",
          input: { a: 1, b: 1 },
        };
        yield { type: "done" };
      },
    };

    const runtime = createAgentRuntime({ memory, llm, tools });
    const events = await collect(
      runtime.runTurn({ userMessage: "loop" }),
    );

    assert.equal(calls, MAX_TOOL_ITERATIONS);
    const err = events.find((e) => e.type === "error");
    assert.ok(err && err.type === "error");
    assert.match(err.message, /límite de iteraciones/);
    assert.equal(events.some((e) => e.type === "done"), false);
  });
});

describe("arquitectura: AgentRuntime desacoplado del proveedor concreto", () => {
  it("runtime.ts no importa el proveedor Anthropic ni el SDK", () => {
    const runtimePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/agents/runtime.ts",
    );
    const src = readFileSync(runtimePath, "utf8");
    assert.doesNotMatch(src, /providers\/anthropic/);
    assert.doesNotMatch(src, /@anthropic-ai\/sdk/);
    assert.doesNotMatch(src, /createAnthropicProvider/);
  });

  it("runtime.ts no contiene nombres concretos de tools", () => {
    const runtimePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/agents/runtime.ts",
    );
    const src = readFileSync(runtimePath, "utf8");
    assert.doesNotMatch(src, /filesystem\.write/);
    assert.doesNotMatch(src, /gmail\.send/);
    assert.doesNotMatch(src, /test\.confirm/);
  });

  it("el SDK solo se importa en providers/anthropic.ts", () => {
    const srcRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src",
    );
    const hits: string[] = [];

    function walk(dir: string): void {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!name.endsWith(".ts")) continue;
        const text = readFileSync(full, "utf8");
        if (text.includes("@anthropic-ai/sdk")) {
          hits.push(path.relative(srcRoot, full));
        }
      }
    }

    walk(srcRoot);
    assert.deepEqual(hits, ["providers/anthropic.ts"]);
  });
});
