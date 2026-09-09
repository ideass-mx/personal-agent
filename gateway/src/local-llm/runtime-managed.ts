/**
 * LocalLLMRuntime oficial: llama-server administrado (PHASE 61.1).
 * node-llama-cpp permanece experimental en runtime-node-llama.ts.
 */
import { LocalModelError, userMessageForCode } from "./errors.ts";
import {
  createLocalRuntimeManager,
  type LocalRuntimeManager,
} from "./runtime-manager.ts";
import type { LocalLLMRuntime } from "./runtime.ts";
import type {
  LocalGenerationEvent,
  LocalGenerationRequest,
  LocalRuntimeState,
} from "./types.ts";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function flattenMessages(request: LocalGenerationRequest): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (request.system?.trim()) {
    out.push({ role: "system", content: request.system.trim() });
  }
  for (const m of request.messages) {
    const content =
      typeof m.content === "string" ? m.content : String(m.content ?? "");
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

/**
 * Cola serial simple — un generate a la vez sobre el mismo runtime.
 */
function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export function createManagedLlamaServerRuntime(options?: {
  manager?: LocalRuntimeManager;
  fetchImpl?: typeof fetch;
  modelName?: string;
  diagnostics?: { record: (input: import("../diagnostics/types.ts").DiagnosticEventInput) => unknown };
}): LocalLLMRuntime {
  const manager =
    options?.manager ??
    createLocalRuntimeManager({
      diagnostics: options?.diagnostics,
      fetchImpl: options?.fetchImpl,
    });
  const fetchImpl = options?.fetchImpl ?? fetch;
  const modelName = options?.modelName ?? "local";
  const enqueue = createSerialQueue();
  let lastModelPath: string | null = null;

  return {
    state(): LocalRuntimeState {
      return manager.state();
    },
    async health() {
      const h = await manager.health();
      return { ok: h.ok, detail: h.detail };
    },
    async ensureReady(
      modelPath: string,
      opts?: { diagnosticId?: string; executionId?: string },
    ) {
      lastModelPath = modelPath;
      if (!manager.isInstalled()) {
        // Intentar instalar runtime (requiere red la primera vez).
        try {
          await manager.install();
        } catch (err) {
          if (err instanceof LocalModelError) throw err;
          throw new LocalModelError(
            "RUNTIME_NOT_INSTALLED",
            userMessageForCode("RUNTIME_NOT_INSTALLED"),
            err,
          );
        }
      }
      await manager.ensureReady(modelPath, opts);
    },
    async *generate(
      request: LocalGenerationRequest,
    ): AsyncGenerator<LocalGenerationEvent> {
      const modelPath = lastModelPath;
      if (!modelPath) {
        throw new LocalModelError(
          "MODEL_NOT_INSTALLED",
          userMessageForCode("MODEL_NOT_INSTALLED"),
        );
      }

      const result = await enqueue(async () => {
        if (request.signal?.aborted) {
          throw new LocalModelError(
            "GENERATION_CANCELLED",
            userMessageForCode("GENERATION_CANCELLED"),
          );
        }
        const { baseUrl } = await manager.ensureReady(modelPath);
        manager.markBusy();
        const messages = flattenMessages(request);
        const chunks: LocalGenerationEvent[] = [];
        try {
          const res = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: request.signal,
            body: JSON.stringify({
              model: modelName,
              messages,
              stream: true,
              max_tokens: request.maxTokens ?? 1024,
            }),
          });
          if (!res.ok || !res.body) {
            throw new LocalModelError(
              "GENERATION_FAILED",
              userMessageForCode("GENERATION_FAILED"),
            );
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            if (request.signal?.aborted) {
              try {
                await reader.cancel();
              } catch {
                /* ignore */
              }
              throw new LocalModelError(
                "GENERATION_CANCELLED",
                userMessageForCode("GENERATION_CANCELLED"),
              );
            }
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const text = json.choices?.[0]?.delta?.content;
                if (text) chunks.push({ type: "text_delta", text });
              } catch {
                /* ignore partial */
              }
            }
          }
          chunks.push({ type: "done" });
          return chunks;
        } catch (err) {
          if (err instanceof LocalModelError) throw err;
          if (request.signal?.aborted) {
            throw new LocalModelError(
              "GENERATION_CANCELLED",
              userMessageForCode("GENERATION_CANCELLED"),
            );
          }
          throw new LocalModelError(
            "GENERATION_FAILED",
            userMessageForCode("GENERATION_FAILED"),
            err,
          );
        } finally {
          manager.markIdle();
        }
      });

      for (const ev of result) {
        yield ev;
      }
    },
    async shutdown() {
      await manager.stop();
    },
  };
}

/** Acceso al manager subyacente (tests / HTTP status). */
export function createManagedLlamaServerRuntimeWithManager(
  manager: LocalRuntimeManager,
  fetchImpl?: typeof fetch,
): { runtime: LocalLLMRuntime; manager: LocalRuntimeManager } {
  return {
    manager,
    runtime: createManagedLlamaServerRuntime({ manager, fetchImpl }),
  };
}
