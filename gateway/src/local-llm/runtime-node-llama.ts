/**
 * Backend opcional node-llama-cpp (CPU, sin CUDA obligatorio).
 * Se carga solo si el paquete está instalado.
 */
import { LocalModelError, userMessageForCode } from "./errors.ts";
import type { LocalLLMRuntime } from "./runtime.ts";
import type {
  LocalGenerationEvent,
  LocalGenerationRequest,
  LocalRuntimeState,
} from "./types.ts";

type LlamaModule = {
  getLlama: (opts?: { gpu?: false | "auto" }) => Promise<{
    loadModel: (opts: { modelPath: string }) => Promise<{
      createContext: (opts?: { contextSize?: number }) => Promise<{
        getSequence: () => unknown;
      }>;
    }>;
  }>;
  LlamaChatSession: new (opts: {
    contextSequence: unknown;
  }) => {
    prompt: (
      prompt: string,
      opts?: { onTextChunk?: (chunk: string) => void; signal?: AbortSignal },
    ) => Promise<string>;
  };
};

/**
 * Intenta usar node-llama-cpp. Fuerza GPU off (CPU-first).
 * Si el API del paquete cambia, fallamos closed → MODEL_RUNTIME_UNAVAILABLE.
 */
export async function createNodeLlamaCppRuntime(): Promise<LocalLLMRuntime> {
  let llamaMod: LlamaModule;
  try {
    // Paquete opcional — no es dependencia dura del Gateway.
    llamaMod = (await import("node-llama-cpp")) as unknown as LlamaModule;
  } catch (err) {
    throw new LocalModelError(
      "MODEL_RUNTIME_UNAVAILABLE",
      userMessageForCode("MODEL_RUNTIME_UNAVAILABLE"),
      err,
    );
  }

  let runtimeState: LocalRuntimeState = "COLD";
  let modelPathLoaded: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let llama: any = null;

  async function load(modelPath: string) {
    runtimeState = "STARTING";
    try {
      llama = await llamaMod.getLlama({ gpu: false });
      const model = await llama.loadModel({ modelPath });
      const context = await model.createContext({ contextSize: 4096 });
      session = new llamaMod.LlamaChatSession({
        contextSequence: context.getSequence(),
      });
      modelPathLoaded = modelPath;
      runtimeState = "READY";
    } catch (err) {
      runtimeState = "STOPPED";
      const msg = err instanceof Error ? err.message : String(err);
      if (/memory|oom|out of memory/i.test(msg)) {
        throw new LocalModelError(
          "MODEL_OUT_OF_MEMORY",
          userMessageForCode("MODEL_OUT_OF_MEMORY"),
          err,
        );
      }
      throw new LocalModelError(
        "MODEL_LOAD_FAILED",
        userMessageForCode("MODEL_LOAD_FAILED"),
        err,
      );
    }
  }

  return {
    state: () => runtimeState,
    async health() {
      return {
        ok: runtimeState === "READY" || runtimeState === "IDLE",
        detail: runtimeState,
      };
    },
    async ensureReady(modelPath: string) {
      if (modelPathLoaded === modelPath && session) {
        runtimeState = "READY";
        return;
      }
      await load(modelPath);
    },
    async *generate(
      request: LocalGenerationRequest,
    ): AsyncGenerator<LocalGenerationEvent> {
      if (!session) {
        throw new LocalModelError(
          "MODEL_LOAD_FAILED",
          userMessageForCode("MODEL_LOAD_FAILED"),
        );
      }
      if (request.signal?.aborted) {
        throw new LocalModelError(
          "MODEL_CANCELLED",
          userMessageForCode("MODEL_CANCELLED"),
        );
      }
      runtimeState = "BUSY";
      const system = request.system?.trim() || "";
      const lastUser = [...request.messages]
        .reverse()
        .find((m) => m.role === "user");
      const prompt = lastUser?.content ?? "";
      // Historial previo: best-effort en un solo prompt (API chat session).
      const history = request.messages
        .slice(0, -1)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      const composed = [
        system ? `System: ${system}` : "",
        history,
        `user: ${prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      try {
        let emitted = "";
        await session.prompt(composed, {
          signal: request.signal,
          onTextChunk(chunk: string) {
            emitted += chunk;
          },
        });
        // Emitir por trozos razonables si el callback no streamó
        if (emitted) {
          const step = 24;
          for (let i = 0; i < emitted.length; i += step) {
            yield {
              type: "text_delta",
              text: emitted.slice(i, i + step),
            };
          }
        }
        yield { type: "done" };
      } catch (err) {
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
      } finally {
        runtimeState = "IDLE";
      }
    },
    async shutdown() {
      session = null;
      modelPathLoaded = null;
      try {
        await llama?.dispose?.();
      } catch {
        /* ignore */
      }
      runtimeState = "STOPPED";
    },
  };
}
