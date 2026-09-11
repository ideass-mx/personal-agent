/**
 * Adapter OpenAI-compatible (OpenAI, xAI, Gemini compat, Groq, OpenRouter).
 * Mapea tool_call / tool_result internos al wire format OpenAI
 * (no JSON.stringify de bloques internos).
 */
import {
  parseLeakedToolCallJson,
  stripLeakedToolCallJson,
} from "../agents/strip-tool-call-leak.ts";
import { AgentDiagnosticError } from "../diagnostics/error.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { redactString } from "../credentials/credential-redactor.ts";
import type {
  LLMCapabilities,
  LLMContentBlock,
  LLMEvent,
  LLMMessage,
  LLMProvider,
  LLMRequest,
} from "./types.ts";

export {
  parseLeakedToolCallJson,
  stripLeakedToolCallJson,
} from "../agents/strip-tool-call-leak.ts";

type OpenAiCompatProviderInput = {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  diagnostics?: SqliteDiagnosticsStore;
  /** Default overall wall-clock for chat completions (incluye stream). */
  timeoutMs?: number;
  /** Sin chunks SSE durante este tiempo → abort (default por proveedor). */
  idleTimeoutMs?: number;
  capabilities?: Partial<LLMCapabilities>;
};

type OpenAiWireMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

function isQuotaOrBillingDenial(status: number, body: string): boolean {
  if (status !== 402 && status !== 403) return false;
  return /credit|credits|spending|quota|billing|payment|insufficient funds|usage limit|monthly spending/i.test(
    body,
  );
}

function mapHttpError(input: {
  provider: string;
  model: string;
  diagnosticId?: string;
  status: number;
  body: string;
  stage: "LLM_REQUEST" | "LLM_STREAM";
}): AgentDiagnosticError {
  let errorCode = "LLM_REQUEST_FAILED";
  let message = `provider_http_${input.status}`;
  if (isQuotaOrBillingDenial(input.status, input.body)) {
    errorCode = "LLM_QUOTA_EXCEEDED";
    message = "provider_quota_exceeded";
  } else if (input.status === 401 || input.status === 403) {
    errorCode = "LLM_AUTH_FAILED";
  } else if (input.status === 404) errorCode = "LLM_MODEL_NOT_FOUND";
  else if (input.status === 429) errorCode = "LLM_RATE_LIMITED";
  else if (input.status >= 500) errorCode = "LLM_PROVIDER_UNAVAILABLE";
  else if (input.status === 400) errorCode = "LLM_REQUEST_INVALID";
  return new AgentDiagnosticError({
    message,
    component: "LLM_PROVIDER",
    stage: input.stage,
    errorCode,
    diagnosticId: input.diagnosticId,
    httpStatus: input.status,
    metadata: {
      provider: input.provider,
      model: input.model,
      safeProviderMessage: redactString(input.body.slice(0, 220)),
    },
  });
}

/** Convierte mensajes internos → wire OpenAI (assistant.tool_calls + role=tool). */
export function toOpenAiCompatibleMessages(
  messages: LLMMessage[],
): OpenAiWireMessage[] {
  const out: OpenAiWireMessage[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = m.content as LLMContentBlock[];
    const texts = blocks
      .filter((b): b is Extract<LLMContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text);
    const toolCalls = blocks.filter(
      (b): b is Extract<LLMContentBlock, { type: "tool_call" }> =>
        b.type === "tool_call",
    );
    const toolResults = blocks.filter(
      (b): b is Extract<LLMContentBlock, { type: "tool_result" }> =>
        b.type === "tool_result",
    );

    if (toolResults.length > 0 && toolCalls.length === 0) {
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.toolCallId,
          content: tr.content,
        });
      }
      if (texts.length > 0) {
        out.push({ role: "user", content: texts.join("\n") });
      }
      continue;
    }

    const contentText = texts.join("");
    if (toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: contentText.trim() ? contentText : null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(
              tc.input && typeof tc.input === "object" ? tc.input : {},
            ),
          },
        })),
      });
      continue;
    }

    out.push({
      role: m.role,
      content: contentText,
    });
  }
  return out;
}

/** ¿Puede ser JSON filtrado de tool_call? (no confundir con markdown `[texto](url)`). */
export function classifyContentHold(held: string): "stream" | "hold" | "undecided" {
  const peek = held.trimStart();
  if (!peek) return "undecided";
  if (!peek.startsWith("[")) return "stream";
  if (/^\[[^\]]{0,240}\]\s*\(/.test(peek)) return "stream";
  if (peek.startsWith("[{") || peek.startsWith("[\n{") || peek.startsWith("[ {")) {
    return "hold";
  }
  if (peek.length >= 2 && peek[1] !== "{" && peek[1] !== "\n" && peek[1] !== " ") {
    return "stream";
  }
  if (peek.length >= 48 && !peek.includes("tool_call")) return "stream";
  return "undecided";
}

async function* parseSseToEvents(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<LLMEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  const pending = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let held = "";
  let contentMode: "undecided" | "stream" | "hold" = "undecided";
  const reader = stream.getReader();
  const onAbort = () => {
    void reader.cancel("aborted");
  };
  signal?.addEventListener("abort", onAbort);

  const flushTools = function* (): Generator<LLMEvent> {
    const keys = [...pending.keys()].sort((a, b) => a - b);
    for (const k of keys) {
      const acc = pending.get(k);
      if (!acc?.name) continue;
      let parsedInput: unknown = {};
      if (acc.arguments.trim()) {
        try {
          parsedInput = JSON.parse(acc.arguments);
        } catch {
          parsedInput = {};
        }
      }
      yield {
        type: "tool_call",
        id: acc.id || `tool_${Date.now()}_${k}`,
        name: acc.name,
        input: parsedInput,
      };
    }
    pending.clear();
  };

  const onContentPiece = function* (piece: string): Generator<LLMEvent> {
    if (!piece) return;
    if (contentMode === "stream") {
      yield { type: "text_delta", text: piece };
      return;
    }
    held += piece;
    const cls = classifyContentHold(held);
    if (cls === "stream") {
      contentMode = "stream";
      yield { type: "text_delta", text: held };
      held = "";
      return;
    }
    if (cls === "hold") contentMode = "hold";
    // hold / undecided: no yield aún
  };

  const flushHeld = function* (): Generator<LLMEvent> {
    if (!held) {
      contentMode = "undecided";
      return;
    }
    const leaked = parseLeakedToolCallJson(held);
    if (leaked) {
      for (const tc of leaked) {
        yield {
          type: "tool_call",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        };
      }
    } else {
      const cleaned = stripLeakedToolCallJson(held);
      if (cleaned) yield { type: "text_delta", text: cleaned };
    }
    held = "";
    contentMode = "undecided";
  };

  try {
    for (;;) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value;
      buffer += decoder.decode(chunk, { stream: true });
      for (;;) {
        const idx = buffer.indexOf("\n\n");
        if (idx < 0) break;
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = frame
          .split("\n")
          .map((x) => x.trim())
          .filter((x) => x.startsWith("data:"))
          .map((x) => x.slice(5).trim());
        for (const line of lines) {
          if (!line || line === "[DONE]") {
            if (line === "[DONE]") {
              yield* flushHeld();
              yield* flushTools();
            }
            continue;
          }
          let payload: any;
          try {
            payload = JSON.parse(line);
          } catch {
            continue;
          }
          const choices = Array.isArray(payload?.choices) ? payload.choices : [];
          for (const c of choices) {
            const delta = c?.delta ?? {};
            if (typeof delta?.content === "string" && delta.content.length > 0) {
              yield* onContentPiece(delta.content);
            }
            const toolCalls = Array.isArray(delta?.tool_calls)
              ? delta.tool_calls
              : [];
            for (const tc of toolCalls) {
              const i = typeof tc?.index === "number" ? tc.index : 0;
              const prev = pending.get(i) || { id: "", name: "", arguments: "" };
              if (typeof tc?.id === "string" && tc.id) prev.id = tc.id;
              const fn = tc?.function ?? {};
              if (typeof fn?.name === "string" && fn.name) prev.name = fn.name;
              if (typeof fn?.arguments === "string") {
                prev.arguments += fn.arguments;
              }
              pending.set(i, prev);
            }
            const finish = c?.finish_reason;
            if (
              finish === "tool_calls" ||
              finish === "stop" ||
              finish === "length"
            ) {
              yield* flushHeld();
              if (finish === "tool_calls" || pending.size > 0) {
                yield* flushTools();
              }
            }
          }
        }
      }
    }
    yield* flushHeld();
    yield* flushTools();
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export function createOpenAiCompatibleProvider(
  input: OpenAiCompatProviderInput,
): LLMProvider {
  const base = input.baseUrl.replace(/\/+$/, "");
  return {
    id: input.providerId,
    capabilities: {
      streaming: true,
      toolCalling: true,
      vision: false,
      structuredOutput: false,
      ...input.capabilities,
    },
    async *stream(request: LLMRequest) {
      const model = request.model || input.model;
      const url = `${base}/chat/completions`;
      if (/[?&#](api[_-]?key|token|secret|access[_-]?token)=/i.test(url)) {
        throw new AgentDiagnosticError({
          message: "secrets_in_url_forbidden",
          component: "LLM_PROVIDER",
          stage: "LLM_REQUEST",
          errorCode: "LLM_INVALID_CONFIGURATION",
          diagnosticId: request.diagnosticId,
          metadata: { provider: input.providerId, model },
        });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(input.extraHeaders ?? {}),
      };
      if (input.apiKey && input.apiKey.trim()) {
        headers.Authorization = `Bearer ${input.apiKey.trim()}`;
      }
      const mapped = toOpenAiCompatibleMessages(request.messages);
      const body: Record<string, unknown> = {
        model,
        stream: true,
        messages: mapped,
      };
      if (request.system?.trim()) {
        body.messages = [
          { role: "system", content: request.system.trim() },
          ...(body.messages as OpenAiWireMessage[]),
        ];
      }
      if (request.tools?.length) {
        body.tools = request.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));
      }
      // No forzar reasoning_effort: en Gemini 3.x "low" midió peor latencia
      // que el default del proveedor (pruebas reales ~1s vs ~12s).
      input.diagnostics?.record({
        diagnosticId: request.diagnosticId || "PA-UNKNOWN",
        component: "LLM_PROVIDER",
        stage: "LLM_REQUEST",
        level: "INFO",
        event: "LLM_REQUEST_STARTED",
        metadata: {
          provider: input.providerId,
          model,
          stream: true,
        },
      });
      const ctrl = new AbortController();
      // El timeout debe cubrir TODO el stream. Antes se limpiaba al recibir
      // headers y Gemini podía quedarse pensando sin límite (UI «trabada»).
      const overallMs =
        input.timeoutMs ??
        (input.providerId === "gemini" ? 120_000 : 90_000);
      const idleMs =
        input.idleTimeoutMs ??
        (input.providerId === "gemini" ? 45_000 : 60_000);
      const startedAt = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const armTimeout = () => {
        if (timer) clearTimeout(timer);
        const remaining = overallMs - (Date.now() - startedAt);
        if (remaining <= 0) {
          ctrl.abort();
          return;
        }
        timer = setTimeout(
          () => ctrl.abort(),
          Math.min(idleMs, remaining),
        );
      };
      armTimeout();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const errBody = await res.text().catch(() => "");
          throw mapHttpError({
            provider: input.providerId,
            model,
            diagnosticId: request.diagnosticId,
            status: res.status,
            body: errBody,
            stage: "LLM_REQUEST",
          });
        }
        armTimeout();
        for await (const ev of parseSseToEvents(res.body, ctrl.signal)) {
          armTimeout();
          yield ev;
        }
        yield { type: "done" };
      } catch (err) {
        if (ctrl.signal.aborted) {
          throw new AgentDiagnosticError({
            message: "provider_stream_timeout",
            component: "LLM_PROVIDER",
            stage: "LLM_STREAM",
            errorCode: "LLM_PROVIDER_UNAVAILABLE",
            diagnosticId: request.diagnosticId,
            metadata: {
              provider: input.providerId,
              model,
              timeoutMs: overallMs,
              idleMs,
            },
          });
        }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
