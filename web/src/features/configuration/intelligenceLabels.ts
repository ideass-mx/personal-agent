/**
 * Labels humanos para modos / providers de inteligencia (PHASE 63).
 */
export function modeIcon(mode: string): string {
  if (mode === "local") return "🔒";
  if (mode === "personal-agent-cloud") return "☁️";
  return "🔑";
}

export function modeTitle(mode: string, displayName?: string): string {
  if (mode === "local") return "Local";
  if (mode === "personal-agent-cloud") return "Personal Agent Cloud";
  if (displayName === "xAI" || displayName === "XAI") return "xAI / Grok";
  return displayName || "Mi proveedor";
}

export function humanModelLabel(provider: string, modelId: string): string {
  if (provider === "local") return modelId === "qwen3-4b" ? "Qwen3 4B" : modelId;
  if (provider === "personal-agent-cloud") return "Personal Agent";
  if (provider === "xai") {
    if (modelId === "grok-4.6" || modelId.startsWith("grok-4.6")) return "Grok 4.6";
    if (modelId.startsWith("grok")) return modelId.replace(/^grok-?/i, "Grok ");
    return "Grok";
  }
  if (provider === "openai" && modelId.startsWith("gpt")) return modelId.toUpperCase();
  if (provider === "anthropic") return "Claude";
  return modelId;
}

export function providerCardTitle(provider: string, displayName?: string): string {
  if (provider === "xai") return "xAI / Grok";
  if (provider === "openai-compatible") return "OpenAI-compatible";
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "groq") return "Groq";
  return displayName || provider;
}

export function configStatusLabel(
  status: "active" | "configured" | "not_configured" | undefined,
): string {
  if (status === "active") return "ACTIVA";
  if (status === "configured") return "CONFIGURADO";
  return "NO CONFIGURADO";
}
