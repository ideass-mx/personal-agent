/**
 * Catálogo de proveedores LLM para setup / onboarding.
 * available=true solo si hay implementación end-to-end real.
 */
import type { LLMProvider, LLMRequest } from "./types.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { hasProviderApiKeyConfigured } from "../setup/llm-key.ts";

export type LlmProviderId = "anthropic" | "openai" | "google";

export type LlmProviderDescriptor = {
  id: LlmProviderId;
  name: string;
  /** true solo con implementación real usable. */
  available: boolean;
};

const CATALOG: readonly LlmProviderDescriptor[] = [
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
  throw new Error(`provider_unavailable:${id}`);
}

/** Verificación mínima real vía el contrato LLMProvider (mismo que usa Runtime). */
export async function verifyProviderConnectivity(
  providerId: string,
): Promise<{ ok: true; sample: string }> {
  if (!isProviderAvailable(providerId)) {
    throw new Error("provider_unavailable");
  }
  if (!hasProviderApiKeyConfigured(providerId)) {
    throw new Error("llm_not_configured");
  }
  const provider = createLlmProvider(providerId);
  const request: LLMRequest = {
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
  return { ok: true, sample: sample.slice(0, 32) };
}
