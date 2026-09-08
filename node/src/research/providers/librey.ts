/**
 * Adapter LibreY — GET /api.php?q=&p=0&t=0
 * Respuesta: array de { title, url, base_url, description } (fork LibreX).
 * @see https://github.com/Ahwxorg/librey api.php
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

export type LibreyProviderOptions = {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly getJson?: typeof searchHttpGetJson;
};

export function createLibreyProvider(
  options: LibreyProviderOptions,
): SearchProvider {
  const base = options.baseUrl.replace(/\/+$/, "");
  const getJson = options.getJson ?? searchHttpGetJson;

  return {
    id: "librey",
    async search(request: SearchRequest): Promise<SearchResponse> {
      let query: string;
      try {
        query = requireQuery(request.query);
      } catch (err) {
        throw new SearchError(
          "invalid_input",
          err instanceof Error ? err.message : "query inválida",
          { provider: "librey", cause: err },
        );
      }
      const limit = clampLimit(request.limit);

      const url = new URL("/api.php", `${base}/`);
      url.searchParams.set("q", query);
      url.searchParams.set("p", "0");
      url.searchParams.set("t", "0");

      const raw = await getJson({
        url: url.toString(),
        timeoutMs: options.timeoutMs,
        signal: request.signal,
        provider: "librey",
      });

      // Error envelope: { error: "..." }
      if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const rec = raw as Record<string, unknown>;
        if (typeof rec.error === "string") {
          throw new SearchError(
            "provider_unavailable",
            "LibreY reportó error",
            { provider: "librey" },
          );
        }
        throw new SearchError("invalid_json", "Formato LibreY inesperado", {
          provider: "librey",
        });
      }

      if (!Array.isArray(raw)) {
        throw new SearchError("invalid_json", "Formato LibreY inesperado", {
          provider: "librey",
        });
      }

      const normalized = raw.map((item) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        return normalizeResult({
          title: r.title,
          url: r.url,
          snippet: r.description,
          domain: r.base_url
            ? (() => {
                try {
                  return new URL(String(r.base_url)).hostname;
                } catch {
                  return undefined;
                }
              })()
            : undefined,
        });
      });

      return {
        query,
        provider: "librey",
        results: takeResults(normalized, limit),
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}
