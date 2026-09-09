/**
 * Redacción de secretos en logs / errores / diagnósticos.
 * No sustituye controles de acceso; evita fuga accidental en serialización.
 */
const SENSITIVE_KEY_RE =
  /^(authorization|api[_-]?key|token|password|passwd|secret|client[_-]?secret|refresh[_-]?token|access[_-]?token|session[_-]?token|hub[_-]?token|device[_-]?credential|pairing[_-]?secret|private[_-]?key|bootstrap[_-]?secret|credential|signature)$/i;

const BEARER_RE = /Bearer\s+\S+/gi;
const ENV_ASSIGN_RE =
  /\b(ANTHROPIC_API_KEY|HUB_TOKEN|OPENAI_API_KEY|XAI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|PERSONAL_AGENT_CLOUD_SESSION_TOKEN|PERSONAL_AGENT_MASTER_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID)\s*[:=]\s*\S+/gi;
const SK_ANT_RE = /sk-ant-[A-Za-z0-9_-]+/g;
const SK_GENERIC_RE = /\bsk-[A-Za-z0-9]{16,}\b/g;
const GENERIC_ASSIGN_RE =
  /\b(api[_-]?key|password|clientSecret|refreshToken|accessToken|sessionToken|secret|accessKeyId|secretAccessKey|accessKey|secretKey|privateKey)\s*[:=]\s*["']?[^\s"',}]+/gi;
const AWS4_RE = /AWS4-HMAC-SHA256[^\s,]*/gi;
const AKIA_RE = /\bAKIA[0-9A-Z]{8,}\b/g;
const URL_SECRET_RE =
  /([?&#/](?:api[_-]?key|token|secret|access[_-]?token|session[_-]?token|refresh[_-]?token)=)([^&#\s]+)/gi;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key.trim());
}

export function redactString(input: string): string {
  return input
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(ENV_ASSIGN_RE, "$1=[REDACTED]")
    .replace(SK_ANT_RE, "[REDACTED]")
    .replace(SK_GENERIC_RE, "[REDACTED]")
    .replace(AWS4_RE, "AWS4-HMAC-SHA256 [REDACTED]")
    .replace(AKIA_RE, "[REDACTED]")
    .replace(URL_SECRET_RE, "$1[REDACTED]")
    .replace(GENERIC_ASSIGN_RE, "$1=[REDACTED]");
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
        out[k] = "[REDACTED]";
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
    return "[REDACTED]";
  }
}
