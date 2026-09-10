/**
 * Proveedores BYOK en onboarding / Intelligence Center.
 *
 * AVAILABLE = respuesta del proveedor (Gateway discovery).
 * RECOMMENDED = static recommendation del Gateway (un ID por proveedor).
 * SELECTED = configuración del usuario.
 *
 * Esta UI no hardcodea el catálogo completo del proveedor.
 * Solo conoce el ID recomendado (espejo de PROVIDER_MODEL_DEFAULTS)
 * para etiquetas / onboarding antes de discovery.
 */
export const PRIMARY_BYOK_PROVIDERS = [
  "openai",
  "anthropic",
  "xai",
  "gemini",
  "openrouter",
] as const;

export type PrimaryByokProviderId = (typeof PRIMARY_BYOK_PROVIDERS)[number];

/** Espejo de gateway PROVIDER_MODEL_DEFAULTS (solo recommended, no catálogo). */
export const STATIC_RECOMMENDED_MODEL_ID: Record<string, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-6",
  xai: "grok-4.6",
  gemini: "gemini-3.6-flash",
  openrouter: "openai/gpt-4.1-mini",
  groq: "llama-3.3-70b-versatile",
  "personal-agent-cloud": "claude-sonnet-4-6",
};

export type ByokModelOption = {
  id: string;
  label: string;
  hint?: string;
};

export function isPrimaryByokProvider(id: string): boolean {
  return (PRIMARY_BYOK_PROVIDERS as readonly string[]).includes(id);
}

/**
 * Opciones locales de Cloud (SOT del Gateway vía Cloud models).
 * BYOK externo debe usar modelos descubiertos, no esta lista.
 */
export function byokModelOptions(provider: string): ByokModelOption[] {
  if (provider === "personal-agent-cloud" || provider === "anthropic") {
    return [
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet",
        hint: "Recomendado",
      },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku",
        hint: "Más rápido",
      },
    ];
  }
  const recommended = STATIC_RECOMMENDED_MODEL_ID[provider];
  if (recommended) {
    return [{ id: recommended, label: recommended, hint: "Recomendado" }];
  }
  return [];
}

export function defaultByokModelId(provider: string): string {
  return (
    STATIC_RECOMMENDED_MODEL_ID[provider] ||
    byokModelOptions(provider)[0]?.id ||
    ""
  );
}
