import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_NAME, SYSTEM_PROMPT } from "../../src/agents/prompts.ts";
import { createAgentRuntime } from "../../src/agents/runtime.ts";
import type { LLMEvent, LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import { toLLMToolDescriptor } from "../../src/tools/descriptor.ts";
import { toProviderSafeToolName } from "../../src/tools/provider-safe-name.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { AgentTool } from "../../src/tools/types.ts";

const sampleTool: AgentTool = {
  name: "test.sample",
  description: "Tool de muestra para descriptors",
  inputSchema: { type: "object", properties: {} },
  executionMode: "automatic",
  async execute() {
    return { ok: true, content: {} };
  },
};

describe("SYSTEM_PROMPT (identidad Personal Agent)", () => {
  it("AGENT_NAME y SYSTEM_PROMPT son Personal Agent, no Claude como identidad primaria", () => {
    assert.equal(AGENT_NAME, "Personal Agent");
    assert.match(SYSTEM_PROMPT, /Personal Agent/);
    assert.match(SYSTEM_PROMPT, /no como Claude/i);
    assert.doesNotMatch(
      SYSTEM_PROMPT,
      /^Eres Claude|^You are Claude|^Soy Claude/m,
    );
  });
});

describe("SYSTEM_PROMPT (capacidades)", () => {
  it("no niega la existencia de herramientas", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.doesNotMatch(lower, /todavía no puedes ejecutar acciones/);
    assert.doesNotMatch(lower, /no tienes acceso a herramientas/);
    assert.doesNotMatch(lower, /solamente puedes conversar/);
    assert.doesNotMatch(lower, /solo puedes conversar/);
  });

  it("indica que puede usar herramientas del runtime sin nombrarlas", () => {
    assert.match(SYSTEM_PROMPT, /herramientas/i);
    assert.match(SYSTEM_PROMPT, /runtime/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /\bcalculator\b/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /\bgmail\b/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /\bfilesystem\b/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /\bcalendar\b/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /\bmcp\b/i);
  });

  it("exige honestidad sobre ejecución y errores de tools", () => {
    assert.match(SYSTEM_PROMPT, /no inventes resultados/i);
    assert.match(SYSTEM_PROMPT, /error/i);
  });
});

describe("tool descriptors vs prompt", () => {
  it("el descriptor de AgentTool es la fuente de verdad (name/description/schema)", () => {
    const descriptor = toLLMToolDescriptor(sampleTool);
    assert.equal(descriptor.name, sampleTool.name);
    assert.equal(descriptor.description, sampleTool.description);
    assert.deepEqual(descriptor.inputSchema, sampleTool.inputSchema);
    assert.ok(!("execute" in descriptor));
  });

  it("el runtime envía descriptors al LLM sin hardcodear nombres de tools", async () => {
    const requests: LLMRequest[] = [];
    const tools = new ToolRegistry();
    tools.register(sampleTool);

    const llm: LLMProvider = {
      async *stream(request) {
        requests.push(structuredClone(request));
        const events: LLMEvent[] = [
          { type: "text_delta", text: "ok" },
          { type: "done" },
        ];
        for (const e of events) yield e;
      },
    };

    const memory = {
      ensureConversation: () => "c_1",
      addMessage: () => "m_1",
      getHistory: () => [{ role: "user" as const, content: "hola" }],
    };

    const runtime = createAgentRuntime({ memory, llm, tools });
    for await (const _ of runtime.runTurn({ userMessage: "hola" })) {
      /* drain */
    }

    assert.ok(requests[0]?.tools);
    assert.deepEqual(requests[0].tools, [
      {
        ...toLLMToolDescriptor(sampleTool),
        name: toProviderSafeToolName(sampleTool.name),
      },
    ]);
    assert.equal(tools.get("test.sample")?.name, "test.sample");
  });
});
