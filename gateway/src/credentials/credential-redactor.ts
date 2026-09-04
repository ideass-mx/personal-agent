/**
 * Redacción de secretos en logs / errores / diagnósticos.
 * No sustituye controles de acceso; evita fuga accidental en serialización.
 */
const SENSITIVE_KEY_RE =
  /^(authorization|api[_-]?key|token|password|passwd|secret|client[_-]?secret|refresh[_-]?token|access[_-]?token|hub[_-]?token|device[_-]?credential|pairing[_-]?secret|private[_-]?key|credential)$/i;

const BEARER_RE = /Bearer\s+\S+/gi;
const ENV_ASSIGN_RE =
  /\b(ANTHROPIC_API_KEY|HUB_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID)\s*[:=]\s*\S+/gi;
const SK_ANT_RE = /sk-ant-[A-Za-z0-9_-]+/g;
const GENERIC_ASSIGN_RE =
  /\b(api[_-]?key|password|clientSecret|refreshToken|secret|accessKeyId|secretAccessKey|accessKey|secretKey)\s*[:=]\s*["']?[^\s"',}]+/gi;
const AWS4_RE = /AWS4-HMAC-SHA256[^\s,]*/gi;
const AKIA_RE = /\bAKIA[0-9A-Z]{8,}\b/g;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key.trim());
}

export function redactString(input: string): string {
  return input
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(ENV_ASSIGN_RE, "$1=[redacted]")
    .replace(SK_ANT_RE, "[redacted]")
    .replace(AWS4_RE, "AWS4-HMAC-SHA256 [redacted]")
    .replace(AKIA_RE, "[redacted]")
    .replace(GENERIC_ASSIGN_RE, "$1=[redacted]");
}

/**
 * Deep clone redactando claves sensibles y strings con patrones de secreto.
 * Nunca lanza; valores no serializables → "[unserializable]".
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactSecrets(v, depth + 1);
      }
    }
    return out;
  }
  return "[unserializable]";
}

/** JSON seguro para logs (siempre string). */
export function redactForLog(value: unknown): string {
  try {
    if (typeof value === "string") return redactString(value);
    return JSON.stringify(redactSecrets(value));
  } catch {
    return "[redacted]";
  }
}
