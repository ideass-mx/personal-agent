import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyContentHold,
  parseLeakedToolCallJson,
  stripLeakedToolCallJson,
  toOpenAiCompatibleMessages,
} from "../../src/providers/openai-compatible.ts";
import type { LLMMessage } from "../../src/providers/types.ts";

describe("toOpenAiCompatibleMessages", () => {
  it("maps tool_call blocks to assistant.tool_calls (not JSON string)", () => {
    const messages: LLMMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "call_1",
            name: "research.search",
            input: { query: "doctorado remoto" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            toolCallId: "call_1",
            content: '{"ok":true}',
          },
        ],
      },
    ];
    const wire = toOpenAiCompatibleMessages(messages);
    assert.equal(wire.length, 2);
    assert.equal(wire[0].role, "assistant");
    const asst = wire[0] as {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    assert.equal(asst.content, null);
    assert.ok(asst.tool_calls);
    assert.equal(asst.tool_calls![0].id, "call_1");
    assert.equal(asst.tool_calls![0].function.name, "research.search");
    assert.equal(
      JSON.parse(asst.tool_calls![0].function.arguments).query,
      "doctorado remoto",
    );
    assert.equal(wire[1].role, "tool");
    const tool = wire[1] as { role: "tool"; tool_call_id: string; content: string };
    assert.equal(tool.tool_call_id, "call_1");
    assert.equal(tool.content, '{"ok":true}');
    const serialized = JSON.stringify(wire);
    assert.equal(serialized.includes('"type":"tool_call"'), false);
  });

  it("keeps plain string messages", () => {
    const wire = toOpenAiCompatibleMessages([
      { role: "user", content: "hola" },
      { role: "assistant", content: "respuesta" },
    ]);
    assert.deepEqual(wire, [
      { role: "user", content: "hola" },
      { role: "assistant", content: "respuesta" },
    ]);
  });
});

describe("parseLeakedToolCallJson / strip", () => {
  const leak =
    '[{"type":"tool_call","id":"call_957388","name":"research.search","input":{"query":"doctorado en linea"}}]';

  it("parses leaked internal tool_call JSON", () => {
    const parsed = parseLeakedToolCallJson(leak);
    assert.ok(parsed);
    assert.equal(parsed![0].name, "research.search");
    assert.equal(
      (parsed![0].input as { query: string }).query,
      "doctorado en linea",
    );
  });

  it("strips whole-message leak to empty", () => {
    assert.equal(stripLeakedToolCallJson(leak), "");
  });

  it("does not strip normal prose", () => {
    const prose = "Encontré varios doctorados remotos.";
    assert.equal(stripLeakedToolCallJson(prose), prose);
  });

  it("classifyContentHold: markdown link streams; tool JSON holds", () => {
    assert.equal(classifyContentHold("*[UNAM](https://www.unam.mx/)"), "stream");
    assert.equal(classifyContentHold('[{"type":"tool_call"'), "hold");
    assert.equal(classifyContentHold("Hola mundo"), "stream");
  });
});
