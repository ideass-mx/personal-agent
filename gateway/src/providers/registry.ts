/**
 * Catálogo de proveedores LLM para setup / onboarding.
 * available=true solo si hay implementación end-to-end real.
 */
import type { LLMProvider, LLMRequest } from "./types.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { hasProviderApiKeyConfigured } from "../setup/llm-key.ts";
import { DEFAULT_AGENT_MODEL } from "../agents/definition.ts";
import {
  createFakeLocalRuntime,
  createLocalModelManager,
  createLocalProvider,
  DEFAULT_LOCAL_MODEL_ID,
  isLocalLlmConfigured,
} from "../local-llm/index.ts";

export type LlmProviderId = "local" | "anthropic" | "openai" | "google";

export type LlmProviderDescriptor = {
  id: LlmProviderId;
  name: string;
  /** true solo con implementación real usable. */
  available: boolean;
};

/** Forma pública del diagnóstico de conectividad (sin apiKey ni muestra larga). */
export type LlmConnectivityResult = {
  ok: true;
  provider: string;
  model: string;
  credentialConfigured: true;
  request: "success";
  /** Truncado interno; no exponer en HTTP de producto. */
  sample?: string;
};

const CATALOG: readonly LlmProviderDescriptor[] = [
  { id: "local", name: "Modelo local", available: true },
  { id: "anthropic", name: "Anthropic", available: true },
  { id: "openai", name: "OpenAI", available: false },
  { id: "google", name: "Google", available: false },
] as const;

export function listProviders(): LlmProviderDescriptor[] {
  return CATALOG.map((p) => ({ ...p }));
}

export function getProviderDescriptor(
  id: string,
): LlmProviderDescriptor | null {
  const found = CATALOG.find((p) => p.id === id);
  return found ? { ...found } : null;
}

export function isProviderAvailable(id: string): boolean {
  return getProviderDescriptor(id)?.available === true;
}

/**
 * Instancia el provider concreto si está disponible.
 * OpenAI/Google: no inventar implementaciones.
 */
export function createLlmProvider(id: string): LLMProvider {
  if (id === "anthropic") {
    return createAnthropicProvider();
  }
  if (id === "local") {
    const manager = createLocalModelManager();
    const runtime =
      process.env.PERSONAL_AGENT_LOCAL_LLM_FAKE === "1" ||
      process.env.NODE_ENV === "test"
        ? createFakeLocalRuntime()
        : createFakeLocalRuntime(); // boot path uses createDefaultLocalRuntime in index
    return createLocalProvider({ manager, runtime });
  }
  throw new Error(`provider_unavailable:${id}`);
}

/** ¿Hay inteligencia lista? Local instalado O clave Anthropic — sin fallback automático. */
export function isAnyLlmConfigured(): boolean {
  try {
    if (isLocalLlmConfigured(createLocalModelManager())) return true;
  } catch {
    /* ignore */
  }
  return hasProviderApiKeyConfigured("anthropic");
}

/** Verificación mínima real vía el contrato LLMProvider (mismo que usa Runtime). */
export async function verifyProviderConnectivity(
  providerId: string,
): Promise<LlmConnectivityResult> {
  if (!isProviderAvailable(providerId)) {
    throw new Error("provider_unavailable");
  }
  if (providerId === "local") {
    const manager = createLocalModelManager();
    if (!isLocalLlmConfigured(manager)) {
      throw new Error("llm_not_configured");
    }
    const runtime = createFakeLocalRuntime({
      reply: "OK",
    });
    // Si hay URL real, createDefault se usa en arranque; verify usa fake solo
    // cuando PERSONAL_AGENT_LOCAL_LLM_FAKE=1. Preferir runtime fake seguro
    // para no cargar GGUF en verify HTTP.
    const useFake =
      process.env.PERSONAL_AGENT_LOCAL_LLM_FAKE === "1" ||
      !process.env.PERSONAL_AGENT_LOCAL_LLM_URL;
    const provider = createLocalProvider({
      manager,
      runtime: useFake
        ? runtime
        : createFakeLocalRuntime({ reply: "OK" }),
    });
    let text = "";
    for await (const event of provider.stream({
      model: DEFAULT_LOCAL_MODEL_ID,
      messages: [
        { role: "user", content: "Responde únicamente con la palabra OK." },
      ],
    })) {
      if (event.type === "text_delta") text += event.text;
    }
    const sample = text.trim();
    if (!sample) throw new Error("empty_llm_response");
    console.log(
      `[gateway] llm_connectivity provider=local model=${DEFAULT_LOCAL_MODEL_ID} request=success`,
    );
    return {
      ok: true,
      provider: "local",
      model: DEFAULT_LOCAL_MODEL_ID,
      credentialConfigured: true,
      request: "success",
      sample: sample.slice(0, 32),
    };
  }
  if (!hasProviderApiKeyConfigured(providerId)) {
    throw new Error("llm_not_configured");
  }
  const model = DEFAULT_AGENT_MODEL;
  const provider = createLlmProvider(providerId);
  const request: LLMRequest = {
    model,
    messages: [
      { role: "user", content: "Responde únicamente con la palabra OK." },
    ],
  };
  let text = "";
  for await (const event of provider.stream(request)) {
    if (event.type === "text_delta") text += event.text;
  }
  const sample = text.trim();
  if (!sample) throw new Error("empty_llm_response");
  console.log(
    `[gateway] llm_connectivity provider=${providerId} model=${model} credentialConfigured=true request=success`,
  );
  return {
    ok: true,
    provider: providerId,
    model,
    credentialConfigured: true,
    request: "success",
    sample: sample.slice(0, 32),
  };
}
