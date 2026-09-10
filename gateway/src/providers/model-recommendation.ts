/**
 * PHASE 63.2 — Fuente de recomendación de modelos.
 *
 * Hoy: estática (configuración centralizada).
 * Futuro: RemoteModelRecommendationSource → Personal Agent Model Catalog API.
 *
 * La recomendación NUNCA es fuente de verdad de disponibilidad:
 * solo cuenta si también aparece en el listado del proveedor.
 */
export interface ModelRecommendationSource {
  getRecommendedModel(providerId: string): string | null;
}

/**
 * IDs ya usados en el proyecto (stubs / BYOK). Un solo lugar.
 * No es un catálogo completo de modelos del proveedor.
 */
export const PROVIDER_MODEL_DEFAULTS: Record<
  string,
  { recommendedModel: string }
> = {
  openai: { recommendedModel: "gpt-4.1-mini" },
  anthropic: { recommendedModel: "claude-sonnet-4-6" },
  xai: { recommendedModel: "grok-4.6" },
  gemini: { recommendedModel: "gemini-3.6-flash" },
  openrouter: { recommendedModel: "openai/gpt-4.1-mini" },
  groq: { recommendedModel: "llama-3.3-70b-versatile" },
  "personal-agent-cloud": { recommendedModel: "claude-sonnet-4-6" },
};

export class StaticModelRecommendationSource
  implements ModelRecommendationSource
{
  getRecommendedModel(providerId: string): string | null {
    const id = PROVIDER_MODEL_DEFAULTS[providerId]?.recommendedModel?.trim();
    return id || null;
  }
}

let activeRecommendationSource: ModelRecommendationSource =
  new StaticModelRecommendationSource();

/** Permite sustituir la fuente (tests / futuro remoto). */
export function setModelRecommendationSource(
  source: ModelRecommendationSource,
): void {
  activeRecommendationSource = source;
}

export function getModelRecommendationSource(): ModelRecommendationSource {
  return activeRecommendationSource;
}

export function resetModelRecommendationSource(): void {
  activeRecommendationSource = new StaticModelRecommendationSource();
}

/**
 * Recomendación efectiva: estática ∩ disponible.
 * Si el ID estático no está en available → null (nunca inventar).
 */
export function resolveRecommendedAgainstAvailable(
  providerId: string,
  availableModelIds: readonly string[],
  source: ModelRecommendationSource = activeRecommendationSource,
): string | null {
  const wanted = source.getRecommendedModel(providerId);
  if (!wanted) return null;
  return availableModelIds.includes(wanted) ? wanted : null;
}

/** Primer modelo del orden del proveedor (default de selección, no “recomendado”). */
export function firstAvailableModelId(
  availableModelIds: readonly string[],
): string | null {
  for (const id of availableModelIds) {
    const t = id.trim();
    if (t) return t;
  }
  return null;
}
