/**
 * arXiv Atom API — sin API key.
 * https://info.arxiv.org/help/api/user-manual.html
 */
import { fetchText } from "./../http-client.ts";
import { buildPaResult, clampPaLimit } from "./../normalize.ts";
import type { PaSearchProvider, PaSearchRequest, PaSearchResult } from "./../types.ts";

function extractTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m?.[1]?.trim();
}

export function createArxivProvider(): PaSearchProvider {
  return {
    id: "arxiv",
    async search(request: PaSearchRequest): Promise<PaSearchResult[]> {
      const limit = Math.min(clampPaLimit(request.limit), 10);
      const url = new URL("https://export.arxiv.org/api/query");
      url.searchParams.set("search_query", `all:${request.query}`);
      url.searchParams.set("start", "0");
      url.searchParams.set("max_results", String(limit));

      const { text: xml } = await fetchText({
        url: url.toString(),
        provider: "arxiv",
        signal: request.signal,
        headers: { Accept: "application/atom+xml" },
      });

      const entries = xml.split("<entry>").slice(1);
      const out: PaSearchResult[] = [];
      const retrievedAt = new Date().toISOString();
      for (const entry of entries) {
        const title = extractTag(entry, "title")?.replace(/\s+/g, " ");
        const id = extractTag(entry, "id");
        const summary = extractTag(entry, "summary")?.replace(/\s+/g, " ");
        const published = extractTag(entry, "published");
        if (!title || !id) continue;
        const r = buildPaResult({
          title,
          url: id,
          snippet: summary?.slice(0, 400),
          provider: "arxiv",
          publishedAt: published,
          retrievedAt,
        });
        if (r) out.push(r);
      }
      return out;
    },
  };
}
