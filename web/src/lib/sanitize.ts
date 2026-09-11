const SENSITIVE =
  /"(hub_token|token|password|authorization|api[_-]?key|secret|credential|HUB_TOKEN)"\s*:\s*"[^"]*"/gi;

export function sanitizeInputSummary(raw: unknown, maxLen = 800): string {
  let text =
    typeof raw === "string" ? raw : JSON.stringify(raw ?? {}, null, 0);
  text = text.trim() || "{}";
  text = text.replace(SENSITIVE, (_m, key: string) => `"${key}":"***"`);
  if (text.length > maxLen) return text.slice(0, maxLen) + "…";
  return text;
}

export function sanitizeDiagnostics(text: string): string {
  return text
    .replace(/HUB_TOKEN\s*[:=]\s*\S+/gi, "HUB_TOKEN=[redacted]")
    .replace(/ANTHROPIC_API_KEY\s*[:=]\s*\S+/gi, "ANTHROPIC_API_KEY=[redacted]")
    .replace(/Authorization\s*:\s*Bearer\s+\S+/gi, "Authorization: Bearer [redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]");
}

export function maskToken(token: string): string {
  if (!token || token.length < 8) return "••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function humanizeError(code?: string, message?: string): string {
  const m = (message || "").toLowerCase();
  const c = (code || "").toLowerCase();
  if (c === "agent_disconnected" || m.includes("agent_disconnected")) {
    return "No puedo ejecutar esa acción porque el agente de tu PC no está disponible. Verifica que esté ejecutándose y vuelve a intentarlo.";
  }
  if (
    c === "llm_quota_exceeded" ||
    c === "provider_quota_exceeded" ||
    m.includes("provider_quota_exceeded") ||
    m.includes("crédito") ||
    m.includes("credito") ||
    m.includes("spending limit")
  ) {
    return "La cuenta del proveedor no tiene crédito disponible o alcanzó su límite de gasto. Revisa el saldo e inténtalo de nuevo.";
  }
  if (c === "auth_failed" || c === "auth_required") {
    return "No se pudo autenticar. Revisa el token de instalación.";
  }
  if (c === "busy") {
    return "El agente está ocupado con otra solicitud. Espera un momento.";
  }
  if (c === "llm_timeout" || m.includes("provider_stream_timeout")) {
    return "El modelo tardó demasiado en responder. Inténtalo de nuevo; si se repite, prueba otro modelo en Inteligencia.";
  }
  if (
    c === "llm_provider_unavailable" ||
    c === "llm_rate_limited" ||
    m.includes("high demand") ||
    m.includes("unavailable") ||
    m.includes("overloaded")
  ) {
    return "El modelo está saturado por alta demanda. Espera unos segundos e inténtalo de nuevo; si continúa, cambia de modelo en Inteligencia.";
  }
  if (c === "internal") {
    return "No pude generar la respuesta. Inténtalo nuevamente.";
  }
  if (message?.trim()) return message.trim();
  if (code) return `Algo salió mal (${code}).`;
  return "Algo salió mal. Inténtalo de nuevo.";
}
