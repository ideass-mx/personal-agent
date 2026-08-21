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
} from "../../src/agent/runtime.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { calculatorTool } from "../../src/tools/calculator.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";

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
  it("ciclo LLM → tool_call calculator → tool_result → LLM → texto final", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register(calculatorTool);

    const requests: LLMRequest[] = [];
    const llm = createScriptedLLM(
      [
        () => [
          {
            type: "tool_call",
            id: "call_1",
            name: "calculator",
            input: { a: 2, b: 3, operation: "add" },
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
    assert.ok(requests[0]?.tools?.some((t) => t.name === "calculator"));
    assert.ok(
      !requests[0]?.tools?.some((t) => "execute" in (t as object)),
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

  it("tool inexistente se convierte en tool_result de error y el LLM puede continuar", async () => {
    const memory = createFakeMemory();
    const tools = new ToolRegistry();
    tools.register(calculatorTool);

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
    tools.register(calculatorTool);

    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "call_div",
          name: "calculator",
          input: { a: 1, b: 0, operation: "divide" },
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
    tools.register(calculatorTool);

    let calls = 0;
    const llm: LLMProvider = {
      async *stream() {
        calls += 1;
        yield {
          type: "tool_call",
          id: `call_${calls}`,
          name: "calculator",
          input: { a: 1, b: 1, operation: "add" },
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

describe("calculator tool", () => {
  it("suma correctamente", async () => {
    const result = await calculatorTool.execute(
      { a: 2, b: 3, operation: "add" },
      { conversationId: "c" },
    );
    assert.deepEqual(result, {
      ok: true,
      content: { result: 5, a: 2, b: 3, operation: "add" },
    });
  });

  it("divide entre cero devuelve error controlado", async () => {
    const result = await calculatorTool.execute(
      { a: 1, b: 0, operation: "divide" },
      { conversationId: "c" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "division_by_zero");
    }
  });
});

describe("arquitectura: AgentRuntime desacoplado del proveedor concreto", () => {
  it("runtime.ts no importa el proveedor Anthropic ni el SDK", () => {
    const runtimePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/agent/runtime.ts",
    );
    const src = readFileSync(runtimePath, "utf8");
    assert.doesNotMatch(src, /providers\/anthropic/);
    assert.doesNotMatch(src, /@anthropic-ai\/sdk/);
    assert.doesNotMatch(src, /createAnthropicProvider/);
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
