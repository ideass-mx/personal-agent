/**
 * Proveedores BYOK mostrados en onboarding / Intelligence Center.
 * Groq y OpenAI-compatible siguen soportados en backend si ya están
 * configurados, pero no se ofrecen en la UI de conexión principal.
 *
 * La API key autentica la cuenta del usuario.
 * El modelId lo elige el usuario (con un default recomendado); no viene
 * embebido en la key.
 */
export const PRIMARY_BYOK_PROVIDERS = [
  "openai",
  "anthropic",
  "xai",
  "openrouter",
] as const;

export type PrimaryByokProviderId = (typeof PRIMARY_BYOK_PROVIDERS)[number];

export type ByokModelOption = {
  id: string;
  label: string;
  /** Etiqueta corta a la derecha (Recomendado, Más rápido…). */
  hint?: string;
};

export function isPrimaryByokProvider(id: string): boolean {
  return (PRIMARY_BYOK_PROVIDERS as readonly string[]).includes(id);
}

/** Modelos seleccionables en Inteligencia (etiqueta humana → id técnico). */
export function byokModelOptions(provider: string): ByokModelOption[] {
  switch (provider) {
    case "openai":
      return [
        { id: "gpt-4.1-mini", label: "GPT 4.1 mini", hint: "Recomendado" },
        { id: "gpt-4.1", label: "GPT 4.1", hint: "Más capaz" },
        { id: "gpt-4o-mini", label: "GPT 4o mini", hint: "Más rápido" },
      ];
    case "anthropic":
    case "personal-agent-cloud":
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
    case "xai":
      return [
        { id: "grok-4.6", label: "Grok 4.6", hint: "Recomendado" },
        { id: "grok-3-mini", label: "Grok 3 mini", hint: "Más rápido" },
      ];
    case "openrouter":
      return [
        {
          id: "openai/gpt-4.1-mini",
          label: "GPT 4.1 mini",
          hint: "Recomendado",
        },
        {
          id: "anthropic/claude-sonnet-4",
          label: "Claude Sonnet",
        },
        {
          id: "x-ai/grok-4.6",
          label: "Grok 4.6",
        },
      ];
    default:
      return [{ id: "gpt-4.1-mini", label: "Modelo por defecto" }];
  }
}

export function defaultByokModelId(provider: string): string {
  return byokModelOptions(provider)[0]?.id || "gpt-4.1-mini";
}
