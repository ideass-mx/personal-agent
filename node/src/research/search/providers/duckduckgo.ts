/**
 * DuckDuckGo HTML (no-JS) — código propio, sin API key.
 * Endpoint: POST https://html.duckduckgo.com/html/
 * HTML scraper experimental (no camino productivo MCP).
 * No intenta evadir anti-abuso.
 */
import {
  BROWSER_UA,
  fetchText,
  isTransientProviderError,
  withLimitedRetry,
} from "./../http-client.ts";
import { buildPaResult, clampPaLimit, stripTags } from "./../normalize.ts";
import type {
  PaSearchProvider,
  PaSearchRequest,
  PaSearchResult,
} from "./../types.ts";
import { PaSearchError } from "./../types.ts";

const ENDPOINT = "https://html.duckduckgo.com/html/";

export function resolveDdgHref(href: string): string | null {
  try {
    const abs = href.startsWith("http")
      ? href
      : new URL(href, "https://duckduckgo.com").toString();
    const u = new URL(abs);
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (u.hostname.includes("duckduckgo.com")) return null;
    return abs;
  } catch {
    return null;
  }
}

/** Detecta challenge / rate-limit de DDG (páginas anomaly suelen ser grandes). */
export function detectDuckDuckGoBlock(html: string, status: number): boolean {
  if (status === 429 || status === 403 || status === 503) return true;
  // 202 Accepted suele acompañar el challenge anomaly.js
  if (status === 202) return true;
  const lower = html.toLowerCase();
  if (lower.includes("anomaly.js") || lower.includes("cc=botnet")) return true;
  if (
    lower.includes("please complete") &&
    (lower.includes("anomaly") || lower.includes("challenge"))
  ) {
    return true;
  }
  if (/\bcaptcha\b/i.test(html) && !/result__a/i.test(html)) return true;
  return false;
}

export type DdgParsedHit = {
  title: string;
  url: string;
  snippet?: string;
};

/**
 * Parser HTML propio. Lanza rate_limited / parse_error según contenido.
 * No asume que la estructura HTML permanecerá estable.
 */
export function parseDuckDuckGoHtml(
  html: string,
  status = 200,
): DdgParsedHit[] {
  if (typeof html !== "string" || html.length === 0) {
    throw new PaSearchError("parse_error", "HTML vacío", {
      provider: "duckduckgo",
    });
  }
  if (detectDuckDuckGoBlock(html, status)) {
    throw new PaSearchError("rate_limited", "DuckDuckGo limitó o desafió la consulta", {
      provider: "duckduckgo",
    });
  }

  const out: DdgParsedHit[] = [];
  const patterns = [
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]*href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  const seen = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1] ?? "";
      const title = stripTags(m[2] ?? "");
      const url = resolveDdgHref(href);
      if (!url || !title) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      const after = html.slice(m.index, m.index + 1400);
      const snipM = after.match(
        /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div|span)/i,
      );
      out.push({
        title,
        url,
        snippet: snipM ? stripTags(snipM[1] ?? "") : undefined,
      });
    }
    if (out.length > 0) break;
  }

  // HTML malformado / estructura desconocida con señales de página de resultados
  if (
    out.length === 0 &&
    /result__|web-result|links_main/i.test(html) &&
    html.length > 2000
  ) {
    throw new PaSearchError("parse_error", "Estructura HTML de DuckDuckGo no reconocida", {
      provider: "duckduckgo",
    });
  }

  return out;
}

function klFor(language?: string, region?: string): string {
  const lang = (language ?? "").toLowerCase();
  const reg = (region ?? "").toLowerCase();
  if (reg === "mx" || lang === "es" || lang.startsWith("es-")) return "mx-es";
  if (lang === "en" || lang.startsWith("en-")) return "us-en";
  return "wt-wt";
}

export type DuckDuckGoProviderOptions = {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
};

export function createDuckDuckGoProvider(
  options: DuckDuckGoProviderOptions = {},
): PaSearchProvider {
  const timeoutMs = options.timeoutMs ?? 4_500;
  const maxRetries = options.maxRetries ?? 1;

  return {
    id: "duckduckgo",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = clampPaLimit(request.limit);
      const body = new URLSearchParams({
        q: request.query,
        b: "",
        kl: klFor(request.language, request.region),
      });

      const run = async (): Promise<PaSearchResult[]> => {
        const { status, text: html } = await fetchText({
          url: ENDPOINT,
          method: "POST",
          body: body.toString(),
          provider: "duckduckgo",
          signal: request.signal,
          timeoutMs,
          acceptErrorStatus: true,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": BROWSER_UA,
            Referer: "https://html.duckduckgo.com/",
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              (request.language ?? "").toLowerCase().startsWith("es")
                ? "es-MX,es;q=0.9,en;q=0.5"
                : "en-US,en;q=0.9",
          },
        });

        if (status === 429 || status === 403 || status === 503) {
          throw new PaSearchError("rate_limited", `HTTP ${status}`, {
            provider: "duckduckgo",
          });
        }
        if (status < 200 || (status >= 300 && status !== 202)) {
          throw new PaSearchError("http_error", `HTTP ${status}`, {
            provider: "duckduckgo",
          });
        }

        let parsed: DdgParsedHit[];
        try {
          parsed = parseDuckDuckGoHtml(html, status);
        } catch (err) {
          if (err instanceof PaSearchError) throw err;
          throw new PaSearchError("parse_error", "Error parseando DuckDuckGo", {
            provider: "duckduckgo",
            cause: err,
          });
        }

        const retrievedAt = new Date().toISOString();
        const out: PaSearchResult[] = [];
        for (const p of parsed.slice(0, limit)) {
          const r = buildPaResult({
            title: p.title,
            url: p.url,
            snippet: p.snippet,
            provider: "duckduckgo",
            retrievedAt,
          });
          if (r) out.push(r);
        }
        return out;
      };

      return withLimitedRetry(run, {
        maxRetries,
        signal: request.signal,
        shouldRetry: isTransientProviderError,
      });
    },
  };
}
