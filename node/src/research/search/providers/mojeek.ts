/**
 * Mojeek HTML search — sin API key (API oficial es de pago).
 * GET https://www.mojeek.com/search?q=...
 * Parser propio; no copia AGPL. No intenta evadir anti-abuso.
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

export function detectMojeekBlock(html: string, status: number): boolean {
  if (status === 429 || status === 403 || status === 503) return true;
  const lower = html.toLowerCase();
  if (/<title>\s*captcha\s*<\/title>/i.test(html)) return true;
  if (lower.includes("captcha") && !/results-standard|class="ob"|class='ob'/i.test(html)) {
    return true;
  }
  if (lower.includes("are you a robot") || lower.includes("verify you are human")) {
    return true;
  }
  return false;
}

export type MojeekParsedHit = {
  title: string;
  url: string;
  snippet?: string;
};

export function parseMojeekHtml(html: string, status = 200): MojeekParsedHit[] {
  if (typeof html !== "string" || html.length === 0) {
    throw new PaSearchError("parse_error", "HTML vacío", { provider: "mojeek" });
  }
  if (detectMojeekBlock(html, status)) {
    throw new PaSearchError("rate_limited", "Mojeek limitó o desafió la consulta", {
      provider: "mojeek",
    });
  }

  const out: MojeekParsedHit[] = [];
  const seen = new Set<string>();

  const push = (url: string, title: string, snippet?: string) => {
    if (!url || !title || url.includes("mojeek.com")) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ title, url, snippet });
  };

  // Variantes de clase de resultado (tolerancia a cambios menores)
  const titleRes = [
    /<a[^>]+class="[^"]*\bob\b[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]+class="[^"]*\bob\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+class="[^"]*title[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const re of titleRes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const url = m[1] ?? "";
      const title = stripTags(m[2] ?? "");
      const after = html.slice(m.index, m.index + 1600);
      const snipM = after.match(
        /class="[^"]*\bs\b[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)/i,
      );
      push(url, title, snipM ? stripTags(snipM[1] ?? "").slice(0, 400) : undefined);
    }
    if (out.length > 0) break;
  }

  if (out.length === 0) {
    const re2 =
      /<li[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re2.exec(html)) !== null) {
      push(m[1] ?? "", stripTags(m[2] ?? ""));
    }
  }

  if (
    out.length === 0 &&
    /results-standard|results-news|id="results"/i.test(html) &&
    html.length > 2000
  ) {
    throw new PaSearchError("parse_error", "Estructura HTML de Mojeek no reconocida", {
      provider: "mojeek",
    });
  }

  return out;
}

export type MojeekProviderOptions = {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
};

export function createMojeekProvider(
  options: MojeekProviderOptions = {},
): PaSearchProvider {
  const timeoutMs = options.timeoutMs ?? 4_500;
  const maxRetries = options.maxRetries ?? 1;

  return {
    id: "mojeek",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = clampPaLimit(request.limit);
      const url = new URL("https://www.mojeek.com/search");
      url.searchParams.set("q", request.query);
      const lang = (request.language ?? "").toLowerCase();
      const region = (request.region ?? "").toLowerCase();
      if (lang.startsWith("es") || region === "mx") {
        url.searchParams.set("lb", "es");
      }

      const run = async (): Promise<PaSearchResult[]> => {
        const { status, text: html } = await fetchText({
          url: url.toString(),
          provider: "mojeek",
          signal: request.signal,
          timeoutMs,
          acceptErrorStatus: true,
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            Referer: "https://www.mojeek.com/",
            "Accept-Language":
              lang.startsWith("es") || region === "mx"
                ? "es-MX,es;q=0.9,en;q=0.5"
                : "en-US,en;q=0.9",
          },
        });

        if (status === 429 || status === 403 || status === 503) {
          throw new PaSearchError("rate_limited", `HTTP ${status}`, {
            provider: "mojeek",
          });
        }
        if (status < 200 || status >= 300) {
          throw new PaSearchError("http_error", `HTTP ${status}`, {
            provider: "mojeek",
          });
        }

        let parsed: MojeekParsedHit[];
        try {
          parsed = parseMojeekHtml(html, status);
        } catch (err) {
          if (err instanceof PaSearchError) throw err;
          throw new PaSearchError("parse_error", "Error parseando Mojeek", {
            provider: "mojeek",
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
            provider: "mojeek",
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
