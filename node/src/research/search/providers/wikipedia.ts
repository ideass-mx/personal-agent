/**
 * Wikipedia OpenSearch / MediaWiki API — sin API key.
 * https://www.mediawiki.org/wiki/API:Opensearch
 */
import { fetchJson } from "../http-client.ts";
import { buildPaResult, clampPaLimit } from "../normalize.ts";
import type { PaSearchProvider, PaSearchRequest, PaSearchResult } from "../types.ts";

function wikiLang(language?: string): string {
  const l = (language ?? "es").trim().toLowerCase().slice(0, 5);
  if (/^[a-z]{2}$/.test(l)) return l;
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "es";
}

export function createWikipediaProvider(): PaSearchProvider {
  return {
    id: "wikipedia",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = clampPaLimit(request.limit);
      const lang = wikiLang(request.language);
      const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
      url.searchParams.set("action", "opensearch");
      url.searchParams.set("search", request.query);
      url.searchParams.set("limit", String(Math.min(limit, 10)));
      url.searchParams.set("namespace", "0");
      url.searchParams.set("format", "json");
      url.searchParams.set("origin", "*");

      const raw = await fetchJson({
        url: url.toString(),
        provider: "wikipedia",
        signal: request.signal,
      });
      if (!Array.isArray(raw) || raw.length < 4) return [];
      const titles = raw[1];
      const snippets = raw[2];
      const links = raw[3];
      if (!Array.isArray(titles) || !Array.isArray(links)) return [];
      const out: PaSearchResult[] = [];
      const retrievedAt = new Date().toISOString();
      for (let i = 0; i < titles.length; i++) {
        const title = titles[i];
        const link = links[i];
        const snip = Array.isArray(snippets) ? snippets[i] : undefined;
        if (typeof title !== "string" || typeof link !== "string") continue;
        const r = buildPaResult({
          title,
          url: link,
          snippet: typeof snip === "string" ? snip : undefined,
          provider: "wikipedia",
          retrievedAt,
        });
        if (r) out.push(r);
      }
      return out;
    },
  };
}
