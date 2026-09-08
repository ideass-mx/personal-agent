/**
 * Adapter Websurfx — GET /search?q=&json=true
 * Respuesta camelCase propia del API Websurfx.
 * @see https://github.com/neon-mmd/websurfx (json=true; description, no content)
 */
import { searchHttpGetJson } from "../http.ts";
import {
  clampLimit,
  normalizeResult,
  requireQuery,
  takeResults,
} from "../normalize.ts";
import type {
  SearchProvider,
  SearchRequest,
  SearchResponse,
} from "../types.ts";
import { SearchError } from "../types.ts";

export type WebsurfxProviderOptions = {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly getJson?: typeof searchHttpGetJson;
};

function safeSearchParam(safeSearch: boolean | undefined): string | undefined {
  if (safeSearch === undefined) return undefined;
  // Websurfx safesearch: u8 level (0/1/2 típico)
  return safeSearch ? "1" : "0";
}

export function createWebsurfxProvider(
  options: WebsurfxProviderOptions,
): SearchProvider {
  const base = options.baseUrl.replace(/\/+$/, "");
  const getJson = options.getJson ?? searchHttpGetJson;

  return {
    id: "websurfx",
    async search(request: SearchRequest): Promise<SearchResponse> {
      let query: string;
      try {
        query = requireQuery(request.query);
      } catch (err) {
        throw new SearchError(
          "invalid_input",
          err instanceof Error ? err.message : "query inválida",
          { provider: "websurfx", cause: err },
        );
      }
      const limit = clampLimit(request.limit);

      const url = new URL("/search", `${base}/`);
      url.searchParams.set("q", query);
      url.searchParams.set("json", "true");
      const safesearch = safeSearchParam(request.safeSearch);
      if (safesearch !== undefined) {
        url.searchParams.set("safesearch", safesearch);
      }

      const raw = await getJson({
        url: url.toString(),
        timeoutMs: options.timeoutMs,
        signal: request.signal,
        provider: "websurfx",
      });

      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new SearchError("invalid_json", "Formato Websurfx inesperado", {
          provider: "websurfx",
        });
      }

      const rec = raw as Record<string, unknown>;
      const list = Array.isArray(rec.results) ? rec.results : [];
      const normalized = list.map((item) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        return normalizeResult({
          title: r.title,
          url: r.url,
          snippet: r.description ?? r.content,
          publishedAt: r.publishedAt ?? r.publishedDate,
        });
      });

      return {
        query,
        provider: "websurfx",
        results: takeResults(normalized, limit),
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}
