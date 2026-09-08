/**
 * Crossref Works API — sin API key (mailto recomendado).
 * https://www.crossref.org/documentation/retrieve-metadata/rest-api/
 */
import { fetchJson } from "./../http-client.ts";
import { buildPaResult, clampPaLimit } from "./../normalize.ts";
import type {
  PaSearchProvider,
  PaSearchRequest,
  PaSearchResult,
} from "./../types.ts";

export function createCrossrefProvider(): PaSearchProvider {
  return {
    id: "crossref",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = Math.min(clampPaLimit(request.limit), 10);
      const url = new URL("https://api.crossref.org/works");
      url.searchParams.set("query", request.query);
      url.searchParams.set("rows", String(limit));
      url.searchParams.set("mailto", "research@ideass.mx");

      const raw = await fetchJson({
        url: url.toString(),
        provider: "crossref",
        signal: request.signal,
      });
      if (!raw || typeof raw !== "object") return [];
      const message = (raw as { message?: { items?: unknown } }).message;
      const items = message?.items;
      if (!Array.isArray(items)) return [];
      const out: PaSearchResult[] = [];
      const retrievedAt = new Date().toISOString();
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const titleArr = rec.title;
        const title =
          Array.isArray(titleArr) && typeof titleArr[0] === "string"
            ? titleArr[0]
            : undefined;
        const doi = typeof rec.DOI === "string" ? rec.DOI : undefined;
        if (!title || !doi) continue;
        const created = rec.created as { "date-time"?: string } | undefined;
        const published =
          typeof created?.["date-time"] === "string"
            ? created["date-time"]
            : undefined;
        const container = rec["container-title"];
        const snip =
          Array.isArray(container) && typeof container[0] === "string"
            ? container[0]
            : undefined;
        const r = buildPaResult({
          title,
          url: `https://doi.org/${doi}`,
          snippet: snip,
          provider: "crossref",
          publishedAt: published,
          retrievedAt,
        });
        if (r) out.push(r);
      }
      return out;
    },
  };
}
