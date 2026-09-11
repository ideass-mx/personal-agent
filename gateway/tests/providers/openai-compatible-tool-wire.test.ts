import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyContentHold,
  GEMINI_SKIP_THOUGHT_SIGNATURE,
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
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
        extra_content?: { google?: { thought_signature?: string } };
      }>;
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

  it("round-trips Gemini thought_signature on tool_calls", () => {
    const wire = toOpenAiCompatibleMessages(
      [
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: "call_1",
              name: "research.search",
              input: { query: "tlaxcala" },
              thoughtSignature: "SigFromGemini==",
            },
          ],
        },
      ],
      { ensureGeminiThoughtSignatures: true },
    );
    const asst = wire[0] as {
      tool_calls?: Array<{
        extra_content?: { google?: { thought_signature?: string } };
      }>;
    };
    assert.equal(
      asst.tool_calls?.[0]?.extra_content?.google?.thought_signature,
      "SigFromGemini==",
    );
  });

  it("injects Gemini skip signature when missing on first tool_call", () => {
    const wire = toOpenAiCompatibleMessages(
      [
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: "call_1",
              name: "research.search",
              input: { query: "x" },
            },
          ],
        },
      ],
      { ensureGeminiThoughtSignatures: true },
    );
    const asst = wire[0] as {
      tool_calls?: Array<{
        extra_content?: { google?: { thought_signature?: string } };
      }>;
    };
    assert.equal(
      asst.tool_calls?.[0]?.extra_content?.google?.thought_signature,
      GEMINI_SKIP_THOUGHT_SIGNATURE,
    );
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

describe("gemini openai-compat request shaping", () => {
  it("does not force reasoning_effort and aborts on idle stream", async () => {
    const { createOpenAiCompatibleProvider } = await import(
      "../../src/providers/openai-compatible.ts"
    );
    let seenBody: Record<string, unknown> | null = null;
    let signalAborted = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"hola"}}]}\n\n',
          ),
        );
        // Sin [DONE]: el idle timeout debe abortar la lectura.
      },
    });
    const provider = createOpenAiCompatibleProvider({
      providerId: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.5-flash",
      apiKey: "AIzaSyTest",
      timeoutMs: 5_000,
      idleTimeoutMs: 80,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      seenBody = JSON.parse(String(init?.body || "{}")) as Record<
        string,
        unknown
      >;
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener("abort", () => {
        signalAborted = true;
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    try {
      const events: string[] = [];
      try {
        for await (const ev of provider.stream({
          messages: [{ role: "user", content: "hi" }],
          model: "gemini-3.5-flash",
        })) {
          events.push(ev.type);
        }
        assert.fail("expected idle timeout abort");
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /provider_stream_timeout|aborted|AbortError/i,
        );
        assert.equal(
          (err as { errorCode?: string }).errorCode,
          "LLM_TIMEOUT",
        );
      }
      assert.ok(seenBody);
      assert.equal("reasoning_effort" in seenBody, false);
      assert.equal(seenBody.model, "gemini-3.5-flash");
      assert.equal(seenBody.stream, true);
      assert.equal(signalAborted, true);
      assert.ok(events.includes("text_delta"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
