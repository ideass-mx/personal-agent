import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AGENT_MODEL } from "../agents/definition.ts";
import { SYSTEM_PROMPT } from "../agents/prompts.ts";
import { config } from "../config.ts";
import { AgentDiagnosticError } from "../diagnostics/error.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { getEffectiveAnthropicApiKey } from "../setup/llm-key.ts";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMRequest,
} from "./types.ts";

function toAnthropicContent(
  content: string | LLMContentBlock[],
): string | Anthropic.ContentBlockParam[] {
  if (typeof content === "string") return content;

  return content.map((block): Anthropic.ContentBlockParam => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_call":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input:
            typeof block.input === "object" && block.input !== null
              ? (block.input as Record<string, unknown>)
              : {},
        };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: block.toolCallId,
          content: block.content,
          is_error: block.isError,
        };
    }
  });
}

function toAnthropicMessages(
  messages: LLMMessage[],
): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: toAnthropicContent(m.content),
  }));
}

function mapAnthropicError(
  err: unknown,
  input: { diagnosticId?: string; streamStarted: boolean; model: string },
): AgentDiagnosticError {
  const anyErr = err as {
    status?: number;
    code?: string;
    error?: { type?: string; message?: string; error?: { type?: string; message?: string } };
    requestID?: string | null;
    headers?: { get?: (name: string) => string | null };
    name?: string;
    message?: string;
  };
  const httpStatus =
    typeof anyErr?.status === "number" ? anyErr.status : undefined;
  const providerPayload =
    anyErr?.error?.error && typeof anyErr.error.error === "object"
      ? anyErr.error.error
      : anyErr?.error;
  const message =
    providerPayload?.message ||
    anyErr?.message ||
    "anthropic_request_failed";
  const providerErrorType =
    providerPayload?.type || anyErr?.name || "anthropic_error";
  const providerRequestId =
    typeof anyErr?.requestID === "string"
      ? anyErr.requestID
      : anyErr?.headers?.get?.("request-id") || undefined;
  let errorCode = input.streamStarted
    ? "LLM_STREAM_FAILED"
    : "LLM_REQUEST_FAILED";
  if (httpStatus === 401 || httpStatus === 403) errorCode = "LLM_AUTH_FAILED";
  else if (httpStatus === 404) errorCode = "LLM_MODEL_NOT_FOUND";
  else if (httpStatus === 429) errorCode = "LLM_RATE_LIMITED";
  else if (
    httpStatus === 400 &&
    providerErrorType === "invalid_request_error" &&
    /model/i.test(message)
  ) {
    errorCode = "LLM_MODEL_NOT_FOUND";
  } else if (httpStatus === 400 && providerErrorType === "invalid_request_error") {
    errorCode = "LLM_REQUEST_INVALID";
  }
  else if (/timeout|timed out|abort/i.test(message) || anyErr?.code === "ETIMEDOUT") {
    errorCode = "LLM_TIMEOUT";
  }
  return new AgentDiagnosticError({
    message,
    component: "LLM_PROVIDER",
    stage: input.streamStarted ? "LLM_STREAM" : "LLM_REQUEST",
    errorCode,
    diagnosticId: input.diagnosticId,
    httpStatus,
    metadata: {
      provider: "anthropic",
      providerErrorType,
      providerStatus: httpStatus,
      providerRequestId,
      safeProviderMessage: message,
      sdkErrorName: anyErr?.name || "AnthropicError",
      model: input.model,
    },
  });
}

/** Provider concreto Anthropic. El SDK no debe usarse fuera de este módulo. */
export function createAnthropicProvider(input?: {
  diagnostics?: SqliteDiagnosticsStore;
}): LLMProvider {
  return {
    async *stream(request: LLMRequest) {
      const startedAt = Date.now();
      const apiKey = getEffectiveAnthropicApiKey();
      if (!apiKey) {
        throw new Error(
          "LLM no configurado. Completa el onboarding para conectar la inteligencia.",
        );
      }
      const client = new Anthropic({ apiKey });
      const params: Anthropic.MessageCreateParams = {
        // Modelo efectivo: AgentDefinition vía Runtime (request.model).
        model: request.model ?? DEFAULT_AGENT_MODEL,
        max_tokens: config.maxTokens,
        system: request.system ?? SYSTEM_PROMPT,
        messages: toAnthropicMessages(request.messages),
      };
      input?.diagnostics?.record({
        diagnosticId: request.diagnosticId || "PA-UNKNOWN",
        component: "LLM_PROVIDER",
        stage: "LLM_REQUEST",
        level: "INFO",
        event: "LLM_REQUEST_STARTED",
        metadata: {
          provider: "anthropic",
          model: params.model,
          messageCount: request.messages.length,
          toolCount: request.tools?.length ?? 0,
          systemPresent: Boolean(params.system),
          maxTokens: params.max_tokens,
          stream: true,
        },
      });

      if (request.tools && request.tools.length > 0) {
        params.tools = request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        }));
      }

      let currentTool: { id: string; name: string; json: string } | null =
        null;
      let streamStarted = false;
      try {
        const stream = client.messages.stream(params);
        for await (const event of stream) {
          streamStarted = true;
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "tool_use") {
              currentTool = { id: block.id, name: block.name, json: "" };
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              yield { type: "text_delta", text: event.delta.text };
            } else if (
              event.delta.type === "input_json_delta" &&
              currentTool
            ) {
              currentTool.json += event.delta.partial_json;
            }
          } else if (event.type === "content_block_stop" && currentTool) {
            let parsedInput: unknown = {};
            try {
              parsedInput = currentTool.json ? JSON.parse(currentTool.json) : {};
            } catch {
              parsedInput = {};
            }
            yield {
              type: "tool_call",
              id: currentTool.id,
              name: currentTool.name,
              input: parsedInput,
            };
            currentTool = null;
          }
        }
      } catch (err) {
        const mapped = mapAnthropicError(err, {
          diagnosticId: request.diagnosticId,
          streamStarted,
          model: params.model,
        });
        input?.diagnostics?.record({
          diagnosticId: request.diagnosticId || "PA-UNKNOWN",
          component: "LLM_PROVIDER",
          stage: mapped.stage,
          level: "ERROR",
          event: mapped.errorCode,
          errorCode: mapped.errorCode,
          message: mapped.message,
          durationMs: Date.now() - startedAt,
          metadata: mapped.metadata,
        });
        throw mapped;
      }
      input?.diagnostics?.record({
        diagnosticId: request.diagnosticId || "PA-UNKNOWN",
        component: "LLM_PROVIDER",
        stage: streamStarted ? "LLM_STREAM" : "LLM_RESPONSE",
        level: "INFO",
        event: "LLM_REQUEST_COMPLETED",
        durationMs: Date.now() - startedAt,
        metadata: {
          provider: "anthropic",
          model: params.model,
        },
      });
      yield { type: "done" };
    },
  };
}

export { mapAnthropicError };
