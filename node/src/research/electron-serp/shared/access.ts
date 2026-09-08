/**
 * Señales de acceso / bloqueo HTTP (mínimo para detectBlock).
 */
export type AccessSignal =
  | "ok"
  | "captcha"
  | "http_403"
  | "http_429"
  | "http_challenge"
  | "empty_body"
  | "unexpected";

export function detectAccessSignal(html: string, status: number): AccessSignal {
  if (status === 429) return "http_429";
  if (status === 403) return "http_403";
  if (status === 202) return "http_challenge";
  if (!html || html.length === 0) return "empty_body";

  const lower = html.toLowerCase();
  if (
    lower.includes("anomaly.js") ||
    lower.includes("cc=botnet") ||
    (/\bcaptcha\b/.test(lower) &&
      !/result__a|data-testid=["']result-title/.test(html))
  ) {
    return "captcha";
  }
  if (
    lower.includes("please complete") &&
    (lower.includes("anomaly") || lower.includes("challenge"))
  ) {
    return "http_challenge";
  }
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400) return "unexpected";
  return "ok";
}
