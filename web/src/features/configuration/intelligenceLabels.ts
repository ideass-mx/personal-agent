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
  if (provider === "local") {
    if (modelId === "qwen3-4b") return "Qwen3 4B";
    if (modelId === "qwen3-1.7b") return "Qwen3 1.7B";
    if (modelId === "qwen3-0.6b") return "Qwen3 0.6B";
    return modelId;
  }
  if (provider === "personal-agent-cloud" || provider === "anthropic") {
    if (modelId.includes("haiku")) return "Claude Haiku";
    if (modelId.includes("opus")) return "Claude Opus";
    if (modelId.includes("sonnet") || modelId === "pa-cloud-default") {
      return "Claude Sonnet";
    }
    return "Claude";
  }
  if (provider === "xai") {
    if (modelId === "grok-4.6" || modelId.startsWith("grok-4.6")) return "Grok 4.6";
    if (modelId.startsWith("grok")) return modelId.replace(/^grok-?/i, "Grok ");
    return "Grok";
  }
  if (provider === "gemini") {
    if (modelId.includes("2.5-pro") || modelId.includes("pro")) {
      return "Gemini 2.5 Pro";
    }
    if (modelId.includes("2.0-flash")) return "Gemini 2.0 Flash";
    if (modelId.includes("flash")) return "Gemini 2.5 Flash";
    return "Gemini";
  }
  if (provider === "openai" && modelId.startsWith("gpt")) return modelId.toUpperCase();
  return modelId;
}

export function providerCardTitle(provider: string, displayName?: string): string {
  if (provider === "xai") return "xAI / Grok";
  if (provider === "gemini") return "Gemini";
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
