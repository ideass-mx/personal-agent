/**
 * Adapter: PaSearchEngine → contrato legacy SearchProvider (PHASE 60.6).
 * Experimental — no cableado a research.search de producción todavía.
 */
import type {
  SearchProvider,
  SearchRequest,
  SearchResponse,
} from "../types.ts";
import { createPaSearchEngine, type PaSearchEngine } from "./engine.ts";
import type { PaSearchRequest } from "./types.ts";
import { PaSearchError } from "./types.ts";
import { SearchError } from "../types.ts";

export const PERSONAL_AGENT_SEARCH_ID = "personal-agent-search" as const;

export type PersonalAgentSearchProviderOptions = {
  readonly engine?: PaSearchEngine;
};

export function createPersonalAgentSearchProvider(
  options: PersonalAgentSearchProviderOptions = {},
): SearchProvider {
  const engine = options.engine ?? createPaSearchEngine();
  return {
    id: PERSONAL_AGENT_SEARCH_ID,
    async search(request: SearchRequest): Promise<SearchResponse> {
      const paReq: PaSearchRequest = {
        query: request.query,
        limit: request.limit,
        language: request.language,
        region: request.region,
        safeSearch: request.safeSearch,
        signal: request.signal,
        intent: "research",
      };
      try {
        const res = await engine.search(paReq);
        return {
          query: res.query,
          provider: PERSONAL_AGENT_SEARCH_ID,
          retrievedAt: new Date().toISOString(),
          results: res.results.map((r) => ({
            title: r.title,
            url: r.url,
            ...(r.snippet ? { snippet: r.snippet } : {}),
            domain: r.domain,
            ...(r.publishedAt ? { publishedAt: r.publishedAt } : {}),
          })),
        };
      } catch (err) {
        if (err instanceof PaSearchError) {
          throw new SearchError(
            err.code === "all_providers_failed"
              ? "provider_unavailable"
              : err.code === "invalid_input"
                ? "invalid_input"
                : err.code === "timeout"
                  ? "timeout"
                  : "http_error",
            err.message,
            { provider: PERSONAL_AGENT_SEARCH_ID, cause: err },
          );
        }
        throw err;
      }
    },
  };
}
