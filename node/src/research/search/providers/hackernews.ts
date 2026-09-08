/**
 * Hacker News via Algolia public API — sin API key.
 * https://hn.algolia.com/api
 * Cobertura: technical / community / news de HN (no web general completa).
 */
import { fetchJson } from "../http-client.ts";
import { buildPaResult, clampPaLimit } from "../normalize.ts";
import type {
  PaSearchProvider,
  PaSearchRequest,
  PaSearchResult,
} from "../types.ts";
import { PaSearchError } from "../types.ts";

const ENDPOINT = "https://hn.algolia.com/api/v1/search";

export function parseHackerNewsHits(raw: unknown): Array<{
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}> {
  if (!raw || typeof raw !== "object") {
    throw new PaSearchError("parse_error", "HN JSON inválido", {
      provider: "hackernews",
    });
  }
  const hits = (raw as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  const out: Array<{
    title: string;
    url: string;
    snippet?: string;
    publishedAt?: string;
  }> = [];
  for (const h of hits) {
    if (!h || typeof h !== "object") continue;
    const row = h as {
      title?: string;
      url?: string | null;
      story_url?: string | null;
      objectID?: string;
      created_at?: string;
      author?: string;
      points?: number;
    };
    const title = (row.title ?? "").trim();
    const link =
      (typeof row.url === "string" && row.url.startsWith("http")
        ? row.url
        : undefined) ??
      (typeof row.story_url === "string" && row.story_url.startsWith("http")
        ? row.story_url
        : undefined) ??
      (row.objectID
        ? `https://news.ycombinator.com/item?id=${row.objectID}`
        : undefined);
    if (!title || !link) continue;
    out.push({
      title,
      url: link,
      snippet:
        row.author || row.points !== undefined
          ? `HN · ${row.author ?? "?"} · ${row.points ?? 0} pts`
          : undefined,
      publishedAt: row.created_at,
    });
  }
  return out;
}

export function createHackerNewsProvider(options?: {
  timeoutMs?: number;
}): PaSearchProvider {
  const timeoutMs = options?.timeoutMs ?? 4_000;
  return {
    id: "hackernews",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = Math.min(clampPaLimit(request.limit), 20);
      const url = new URL(ENDPOINT);
      url.searchParams.set("query", request.query);
      url.searchParams.set("hitsPerPage", String(limit));
      url.searchParams.set("tags", "(story,show_hn,ask_hn)");

      const raw = await fetchJson({
        url: url.toString(),
        provider: "hackernews",
        signal: request.signal,
        timeoutMs,
      });
      const parsed = parseHackerNewsHits(raw);
      const retrievedAt = new Date().toISOString();
      const out: PaSearchResult[] = [];
      for (const p of parsed.slice(0, limit)) {
        const r = buildPaResult({
          title: p.title,
          url: p.url,
          snippet: p.snippet,
          provider: "hackernews",
          publishedAt: p.publishedAt,
          retrievedAt,
        });
        if (r) out.push(r);
      }
      return out;
    },
  };
}
