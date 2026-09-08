/**
 * DuckDuckGo Instant Answer API (JSON) — sin API key.
 * Endpoint público: https://api.duckduckgo.com/?q=&format=json
 * NO es el HTML scraper (html.duckduckgo.com). Cobertura limitada (knowledge).
 * No intenta evadir anti-bot.
 */
import { fetchText } from "../http-client.ts";
import { buildPaResult, clampPaLimit } from "../normalize.ts";
import type {
  PaSearchProvider,
  PaSearchRequest,
  PaSearchResult,
} from "../types.ts";
import { PaSearchError } from "../types.ts";

const ENDPOINT = "https://api.duckduckgo.com/";

type DdgTopic = {
  FirstURL?: string;
  Text?: string;
  Topics?: DdgTopic[];
};

function flattenTopics(topics: unknown): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  if (!Array.isArray(topics)) return out;
  for (const t of topics) {
    if (!t || typeof t !== "object") continue;
    const row = t as DdgTopic;
    if (typeof row.FirstURL === "string" && row.FirstURL.startsWith("http")) {
      out.push({ url: row.FirstURL, text: String(row.Text ?? "") });
    }
    if (Array.isArray(row.Topics)) {
      out.push(...flattenTopics(row.Topics));
    }
  }
  return out;
}

export function parseDuckDuckGoInstantAnswer(raw: unknown): Array<{
  title: string;
  url: string;
  snippet?: string;
}> {
  if (!raw || typeof raw !== "object") {
    throw new PaSearchError("parse_error", "Instant Answer inválido", {
      provider: "duckduckgo-ia",
    });
  }
  const d = raw as Record<string, unknown>;
  const out: Array<{ title: string; url: string; snippet?: string }> = [];
  const seen = new Set<string>();

  const push = (url: string, title: string, snippet?: string) => {
    if (!url.startsWith("http") || seen.has(url)) return;
    seen.add(url);
    out.push({ title: title || url, url, snippet });
  };

  const abstractUrl = typeof d.AbstractURL === "string" ? d.AbstractURL : "";
  const heading = typeof d.Heading === "string" ? d.Heading : "";
  const abstract = typeof d.AbstractText === "string" ? d.AbstractText : "";
  if (abstractUrl) {
    push(abstractUrl, heading || abstractUrl, abstract || undefined);
  }

  if (Array.isArray(d.Results)) {
    for (const r of d.Results) {
      if (!r || typeof r !== "object") continue;
      const row = r as { FirstURL?: string; Text?: string };
      if (row.FirstURL) push(row.FirstURL, row.Text ?? row.FirstURL);
    }
  }

  for (const t of flattenTopics(d.RelatedTopics)) {
    push(t.url, t.text.split(" - ")[0] ?? t.text, t.text);
  }

  return out;
}

export function createDuckDuckGoInstantAnswerProvider(options?: {
  timeoutMs?: number;
}): PaSearchProvider {
  const timeoutMs = options?.timeoutMs ?? 4_000;
  return {
    id: "duckduckgo-ia",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = clampPaLimit(request.limit);
      const url = new URL(ENDPOINT);
      url.searchParams.set("q", request.query);
      url.searchParams.set("format", "json");
      url.searchParams.set("no_html", "1");
      url.searchParams.set("skip_disambig", "1");
      if ((request.language ?? "").toLowerCase().startsWith("es")) {
        url.searchParams.set("kl", "mx-es");
      }

      const { status, text } = await fetchText({
        url: url.toString(),
        provider: "duckduckgo-ia",
        signal: request.signal,
        timeoutMs,
        acceptErrorStatus: true,
        headers: { Accept: "application/json" },
      });
      if (status === 429 || status === 403) {
        throw new PaSearchError("rate_limited", `HTTP ${status}`, {
          provider: "duckduckgo-ia",
        });
      }
      if (status < 200 || status >= 300) {
        throw new PaSearchError("http_error", `HTTP ${status}`, {
          provider: "duckduckgo-ia",
        });
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text) as unknown;
      } catch (err) {
        throw new PaSearchError("parse_error", "JSON Instant Answer inválido", {
          provider: "duckduckgo-ia",
          cause: err,
        });
      }
      const parsed = parseDuckDuckGoInstantAnswer(raw);
      const retrievedAt = new Date().toISOString();
      const out: PaSearchResult[] = [];
      for (const p of parsed.slice(0, limit)) {
        const r = buildPaResult({
          title: p.title,
          url: p.url,
          snippet: p.snippet,
          provider: "duckduckgo-ia",
          retrievedAt,
        });
        if (r) out.push(r);
      }
      return out;
    },
  };
}
