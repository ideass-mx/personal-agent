/**
 * LocalProvider — mismo contrato LLMProvider que Anthropic.
 * Sin tool calling en PHASE 61 (capabilities.toolCalling=false).
 */
import { DEFAULT_LOCAL_MODEL_ID } from "./catalog.ts";
import { LocalModelError, userMessageForCode } from "./errors.ts";
import type { LocalModelManager } from "./manager.ts";
import type { LocalLLMRuntime } from "./runtime.ts";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMRequest,
} from "../providers/types.ts";
import { AgentDiagnosticError } from "../diagnostics/error.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";
import { getLocalModelEntry } from "./catalog.ts";

function blocksToText(content: string | LLMContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_result") return b.content;
      if (b.type === "tool_call") return "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function toPlainMessages(
  messages: LLMMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    const text = blocksToText(m.content).trim();
    if (!text) continue;
    out.push({ role: m.role, content: text });
  }
  return out;
}

function mapLocalError(
  err: unknown,
  diagnosticId?: string,
  model?: string,
): AgentDiagnosticError {
  if (err instanceof LocalModelError) {
    return new AgentDiagnosticError({
      message: err.userMessage,
      component: "LLM_PROVIDER",
      stage: "LLM_REQUEST",
      errorCode: err.code,
      diagnosticId,
      metadata: {
        provider: "local",
        model: model || DEFAULT_LOCAL_MODEL_ID,
        safeProviderMessage: err.userMessage,
      },
    });
  }
  const message = err instanceof Error ? err.message : "local_llm_failed";
  return new AgentDiagnosticError({
    message: userMessageForCode("MODEL_GENERATION_FAILED"),
    component: "LLM_PROVIDER",
    stage: "LLM_REQUEST",
    errorCode: "MODEL_GENERATION_FAILED",
    diagnosticId,
    metadata: {
      provider: "local",
      model: model || DEFAULT_LOCAL_MODEL_ID,
      safeProviderMessage: message.slice(0, 200),
    },
  });
}

export function createLocalProvider(input: {
  manager: LocalModelManager;
  runtime: LocalLLMRuntime;
  diagnostics?: SqliteDiagnosticsStore;
}): LLMProvider {
  return {
    async *stream(request: LLMRequest) {
      const entry = getLocalModelEntry(DEFAULT_LOCAL_MODEL_ID);
      const model =
        request.model && request.model !== "claude-sonnet-4-6"
          ? request.model
          : DEFAULT_LOCAL_MODEL_ID;
      const caps = entry?.capabilities;
      input.diagnostics?.record({
        diagnosticId: request.diagnosticId || "PA-UNKNOWN",
        component: "LLM_PROVIDER",
        stage: "LLM_REQUEST",
        level: "INFO",
        event: "LLM_REQUEST_STARTED",
        metadata: {
          provider: "local",
          model,
          messageCount: request.messages.length,
          toolCount:
            caps?.toolCalling === true ? (request.tools?.length ?? 0) : 0,
          systemPresent: Boolean(request.system),
          stream: true,
        },
      });

      const active = input.manager.getActive();
      if (!active) {
        throw mapLocalError(
          new LocalModelError(
            "MODEL_NOT_INSTALLED",
            userMessageForCode("MODEL_NOT_INSTALLED"),
          ),
          request.diagnosticId,
          model,
        );
      }

      try {
        await input.runtime.ensureReady(active.path, {
          diagnosticId: request.diagnosticId,
          executionId: request.diagnosticId,
        });
      } catch (err) {
        throw mapLocalError(err, request.diagnosticId, model);
      }

      const plain = toPlainMessages(request.messages);
      try {
        for await (const ev of input.runtime.generate({
          system: request.system,
          messages: plain,
          maxTokens: 1024,
        })) {
          if (ev.type === "text_delta") {
            yield { type: "text_delta", text: ev.text };
          }
        }
        yield { type: "done" };
      } catch (err) {
        throw mapLocalError(err, request.diagnosticId, model);
      }
    },
  };
}
