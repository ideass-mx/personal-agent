/**
 * Sanitiza URIs para provenance/logs (sin credenciales ni query tokens).
 */
const SENSITIVE_QUERY =
  /^(token|access_token|refresh_token|signature|sig|password|passwd|secret|api_key|apikey|auth|authorization|key)$/i;

export function sanitizeResourceUri(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    u.username = "";
    u.password = "";
    const kept = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      if (SENSITIVE_QUERY.test(key)) return;
      if (/^(Bearer\s+)/i.test(value)) return;
      kept.append(key, value);
    });
    u.search = kept.toString() ? `?${kept.toString()}` : "";
    // Evitar userinfo residual en serialización.
    return u.toString();
  } catch {
    // No URL absoluta: eliminar patrones obvios.
    return trimmed
      .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, "//")
      .replace(/([?&])(token|access_token|signature|password)=[^&]*/gi, "$1$2=[redacted]");
  }
}
