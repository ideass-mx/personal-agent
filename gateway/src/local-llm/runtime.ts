/**
 * LocalLLMRuntime — abstrae llama.cpp / servidor compatible.
 * AgentRuntime no conoce estos detalles.
 */
import { LocalModelError, userMessageForCode } from "./errors.ts";
import type {
  LocalGenerationEvent,
  LocalGenerationRequest,
  LocalRuntimeState,
} from "./types.ts";

export type LocalLLMRuntime = {
  state(): LocalRuntimeState;
  health(): Promise<{ ok: boolean; detail?: string }>;
  ensureReady(modelPath: string): Promise<void>;
  generate(
    request: LocalGenerationRequest,
  ): AsyncIterable<LocalGenerationEvent>;
  shutdown(): Promise<void>;
};

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
 * Runtime HTTP OpenAI-compatible (llama-server, Ollama `/v1`, etc.).
 * PERSONAL_AGENT_LOCAL_LLM_URL p.ej. http://127.0.0.1:8080/v1
 */
export function createHttpLocalRuntime(options: {
  baseUrl: string;
  model?: string;
  fetchImpl?: typeof fetch;
  idleTimeoutMs?: number;
}): LocalLLMRuntime {
  let runtimeState: LocalRuntimeState = "COLD";
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");

  function bumpIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    const ms = options.idleTimeoutMs ?? 5 * 60_000;
    idleTimer = setTimeout(() => {
      if (runtimeState === "IDLE" || runtimeState === "READY") {
        runtimeState = "STOPPED";
      }
    }, ms);
  }

  return {
    state: () => runtimeState,
    async health() {
      try {
        const res = await fetchImpl(`${base}/models`, {
          signal: AbortSignal.timeout(3000),
        });
        return { ok: res.ok, detail: res.ok ? "ok" : `http_${res.status}` };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : "unreachable",
        };
      }
    },
    async ensureReady(_modelPath: string) {
      runtimeState = "STARTING";
      const h = await this.health();
      if (!h.ok) {
        runtimeState = "STOPPED";
        throw new LocalModelError(
          "MODEL_RUNTIME_UNAVAILABLE",
          userMessageForCode("MODEL_RUNTIME_UNAVAILABLE"),
        );
      }
      runtimeState = "READY";
      bumpIdle();
    },
    async *generate(request) {
      if (request.signal?.aborted) {
        throw new LocalModelError(
          "MODEL_CANCELLED",
          userMessageForCode("MODEL_CANCELLED"),
        );
      }
      runtimeState = "BUSY";
      const messages = flattenMessages(request);
      let res: Response;
      try {
        res = await fetchImpl(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: request.signal,
          body: JSON.stringify({
            model: options.model || "local",
            messages,
            stream: true,
            max_tokens: request.maxTokens ?? 1024,
          }),
        });
      } catch (err) {
        runtimeState = "IDLE";
        if (request.signal?.aborted) {
          throw new LocalModelError(
            "MODEL_CANCELLED",
            userMessageForCode("MODEL_CANCELLED"),
          );
        }
        throw new LocalModelError(
          "MODEL_GENERATION_FAILED",
          userMessageForCode("MODEL_GENERATION_FAILED"),
          err,
        );
      }
      if (!res.ok || !res.body) {
        runtimeState = "IDLE";
        throw new LocalModelError(
          "MODEL_GENERATION_FAILED",
          userMessageForCode("MODEL_GENERATION_FAILED"),
        );
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
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
              if (text) yield { type: "text_delta" as const, text };
            } catch {
              /* ignore partial */
            }
          }
        }
        yield { type: "done" as const };
      } finally {
        runtimeState = "IDLE";
        bumpIdle();
      }
    },
    async shutdown() {
      if (idleTimer) clearTimeout(idleTimer);
      runtimeState = "STOPPED";
    },
  };
}

/**
 * Fake runtime (tests / sin binario). Echo controlado.
 */
export function createFakeLocalRuntime(options?: {
  reply?: string | ((req: LocalGenerationRequest) => string);
}): LocalLLMRuntime {
  let runtimeState: LocalRuntimeState = "COLD";
  return {
    state: () => runtimeState,
    async health() {
      return { ok: true, detail: "fake" };
    },
    async ensureReady() {
      runtimeState = "READY";
    },
    async *generate(request) {
      if (request.signal?.aborted) {
        throw new LocalModelError(
          "MODEL_CANCELLED",
          userMessageForCode("MODEL_CANCELLED"),
        );
      }
      runtimeState = "BUSY";
      const reply =
        typeof options?.reply === "function"
          ? options.reply(request)
          : (options?.reply ?? "Hola, soy tu Personal Agent.");
      for (const ch of reply) {
        if (request.signal?.aborted) {
          runtimeState = "IDLE";
          throw new LocalModelError(
            "MODEL_CANCELLED",
            userMessageForCode("MODEL_CANCELLED"),
          );
        }
        yield { type: "text_delta", text: ch };
      }
      yield { type: "done" };
      runtimeState = "IDLE";
    },
    async shutdown() {
      runtimeState = "STOPPED";
    },
  };
}

/**
 * Resuelve runtime oficial:
 * 1. PERSONAL_AGENT_LOCAL_LLM_FAKE=1 → fake (CI)
 * 2. PERSONAL_AGENT_LOCAL_LLM_URL → HTTP externo (pruebas)
 * 3. llama-server administrado (oficial PHASE 61.1)
 * 4. node-llama-cpp (experimental, opcional)
 * 5. unavailable stub
 */
export async function createDefaultLocalRuntime(): Promise<LocalLLMRuntime> {
  if (process.env.PERSONAL_AGENT_LOCAL_LLM_FAKE === "1") {
    return createFakeLocalRuntime();
  }
  const url = process.env.PERSONAL_AGENT_LOCAL_LLM_URL?.trim();
  if (url) {
    return createHttpLocalRuntime({
      baseUrl: url,
      model: process.env.PERSONAL_AGENT_LOCAL_LLM_MODEL?.trim() || "local",
    });
  }
  try {
    const { createManagedLlamaServerRuntime } = await import(
      "./runtime-managed.ts"
    );
    const { resolveRuntimeManifest } = await import("./runtime-manifest.ts");
    if (resolveRuntimeManifest()) {
      return createManagedLlamaServerRuntime();
    }
  } catch (err) {
    process.stderr.write(
      `[gateway] local-llm managed runtime unavailable: ${err instanceof Error ? err.message : "error"}\n`,
    );
  }
  try {
    const mod = await import("./runtime-node-llama.ts");
    return await mod.createNodeLlamaCppRuntime();
  } catch {
    return {
      state: () => "STOPPED" as const,
      async health() {
        return { ok: false, detail: "runtime_unavailable" };
      },
      async ensureReady() {
        throw new LocalModelError(
          "MODEL_RUNTIME_UNAVAILABLE",
          userMessageForCode("MODEL_RUNTIME_UNAVAILABLE"),
        );
      },
      async *generate() {
        throw new LocalModelError(
          "MODEL_RUNTIME_UNAVAILABLE",
          userMessageForCode("MODEL_RUNTIME_UNAVAILABLE"),
        );
      },
      async shutdown() {},
    };
  }
}
