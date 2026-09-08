/**
 * OpenAlex Works API — sin API key (polite pool vía mailto en User-Agent del client).
 * https://docs.openalex.org/
 */
import { fetchJson } from "./../http-client.ts";
import { buildPaResult, clampPaLimit } from "./../normalize.ts";
import type { PaSearchProvider, PaSearchRequest, PaSearchResult } from "./../types.ts";

export function createOpenAlexProvider(): PaSearchProvider {
  return {
    id: "openalex",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = Math.min(clampPaLimit(request.limit), 10);
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set("search", request.query);
      url.searchParams.set("per_page", String(limit));

      const raw = await fetchJson({
        url: url.toString(),
        provider: "openalex",
        signal: request.signal,
        headers: {
          Accept: "application/json",
          // mailto recomendado por OpenAlex para polite pool (sin secretos).
          "User-Agent": "PersonalAgentResearch/0.1 (mailto:research@ideass.mx)",
        },
      });
      if (!raw || typeof raw !== "object") return [];
      const results = (raw as { results?: unknown }).results;
      if (!Array.isArray(results)) return [];
      const out: PaSearchResult[] = [];
      const retrievedAt = new Date().toISOString();
      for (const item of results) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const title =
          typeof rec.display_name === "string"
            ? rec.display_name
            : typeof rec.title === "string"
              ? rec.title
              : undefined;
        const doi =
          typeof rec.doi === "string"
            ? rec.doi
            : typeof (rec.ids as { doi?: string } | undefined)?.doi === "string"
              ? (rec.ids as { doi: string }).doi
              : undefined;
        const id = typeof rec.id === "string" ? rec.id : undefined;
        const landing =
          typeof (rec.primary_location as { landing_page_url?: string } | undefined)
            ?.landing_page_url === "string"
            ? (rec.primary_location as { landing_page_url: string }).landing_page_url
            : undefined;
        const urlCand = landing || doi || id;
        if (!title || !urlCand) continue;
        const year =
          typeof rec.publication_year === "number"
            ? `${rec.publication_year}-01-01`
            : undefined;
        const r = buildPaResult({
          title,
          url: urlCand.startsWith("http") ? urlCand : `https://doi.org/${urlCand.replace(/^https?:\/\/doi\.org\//, "")}`,
          snippet:
            typeof rec.abstract === "string"
              ? rec.abstract.slice(0, 400)
              : undefined,
          provider: "openalex",
          publishedAt: year,
          retrievedAt,
        });
        if (r) out.push(r);
      }
      return out;
    },
  };
}
