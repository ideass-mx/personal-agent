import { AgentDiagnosticError } from "../diagnostics/error.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { redactString } from "../credentials/credential-redactor.ts";
import type { LLMCapabilities, LLMEvent, LLMProvider, LLMRequest } from "./types.ts";

type OpenAiCompatProviderInput = {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  diagnostics?: SqliteDiagnosticsStore;
  /** Default 60s for chat completions. */
  timeoutMs?: number;
  capabilities?: Partial<LLMCapabilities>;
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

async function* parseSseToEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<LLMEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
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
        if (!line || line === "[DONE]") continue;
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
            yield { type: "text_delta", text: delta.content };
          }
          const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
          for (const tc of toolCalls) {
            const fn = tc?.function ?? {};
            if (!fn?.name) continue;
            let parsedInput: unknown = {};
            if (typeof fn.arguments === "string" && fn.arguments.trim()) {
              try {
                parsedInput = JSON.parse(fn.arguments);
              } catch {
                parsedInput = {};
              }
            }
            yield {
              type: "tool_call",
              id: String(tc?.id || `tool_${Date.now()}`),
              name: String(fn.name),
              input: parsedInput,
            };
          }
        }
      }
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
      const body: Record<string, unknown> = {
        model,
        stream: true,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
      };
      if (request.system?.trim()) {
        body.messages = [
          { role: "system", content: request.system.trim() },
          ...(body.messages as Array<{ role: string; content: string }>),
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
      const timeoutMs = input.timeoutMs ?? 60_000;
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
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
      for await (const ev of parseSseToEvents(res.body)) {
        yield ev;
      }
      yield { type: "done" };
    },
  };
}
