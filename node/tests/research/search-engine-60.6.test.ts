/**
 * Tests unitarios PHASE 60.6 — Search Engine propio.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeUrl,
  classifySource,
  createPaSearchEngine,
  createPersonalAgentSearchProvider,
  dedupeResults,
  parseDuckDuckGoHtml,
  rankResults,
  PaSearchError,
  type PaSearchProvider,
  type PaSearchResult,
} from "../../src/research/search/index.ts";

function fakeResult(
  partial: Partial<PaSearchResult> & Pick<PaSearchResult, "title" | "url">,
): PaSearchResult {
  return {
    domain: "example.com",
    sourceType: "other",
    retrievedAt: new Date().toISOString(),
    provider: "duckduckgo",
    ...partial,
  };
}

describe("normalize + canonicalize", () => {
  it("elimina utm_*", () => {
    const u = canonicalizeUrl(
      "https://Example.com/path/?utm_source=x&id=1#frag",
    );
    assert.equal(u, "https://example.com/path?id=1");
  });
});

describe("dedupe", () => {
  it("exact + tracking", () => {
    const { results, duplicateCount } = dedupeResults([
      fakeResult({
        title: "A",
        url: "https://uaq.mx/a",
        domain: "uaq.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "A2",
        url: "https://uaq.mx/a?utm_campaign=x",
        domain: "uaq.mx",
        sourceType: "university",
      }),
    ]);
    assert.equal(results.length, 1);
    assert.equal(duplicateCount, 1);
  });
});

describe("source classifier", () => {
  it("gob / edu / arxiv / github", () => {
    assert.equal(classifySource("https://www.secihti.mx/beca"), "government");
    assert.equal(classifySource("https://www.uaq.mx/doctorado"), "university");
    assert.equal(classifySource("https://arxiv.org/abs/123"), "academic");
    assert.equal(classifySource("https://github.com/x/y"), "community");
  });
});

describe("rank deterministic", () => {
  it("ordena por finalScore estable", () => {
    const ranked = rankResults(
      "doctorado inteligencia artificial México",
      [
        fakeResult({
          title: "Random blog",
          url: "https://blog.example/x",
          domain: "blog.example",
          sourceType: "blog",
          provider: "mojeek",
        }),
        fakeResult({
          title: "Doctorado inteligencia artificial México UAQ",
          url: "https://www.uaq.mx/ia",
          domain: "www.uaq.mx",
          sourceType: "university",
          provider: "wikipedia",
          snippet: "doctorado IA México",
        }),
      ],
      { intent: "research" },
    );
    assert.ok(ranked[0]!.url.includes("uaq.mx"));
    assert.ok(ranked[0]!.finalScore >= ranked[1]!.finalScore);
  });
});

describe("duckduckgo html parser", () => {
  it("extrae result__a", () => {
    const html = `
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.uaq.mx%2Fia">UAQ IA</a>
      <a class="result__snippet">Doctorado</a>
    `;
    const rows = parseDuckDuckGoHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.url, "https://www.uaq.mx/ia");
  });
});

describe("PaSearchEngine", () => {
  it("partial failure no destruye búsqueda", async () => {
    const ok: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          fakeResult({
            title: "Wiki",
            url: "https://es.wikipedia.org/wiki/X",
            domain: "es.wikipedia.org",
            sourceType: "other",
            provider: "wikipedia",
          }),
        ];
      },
    };
    const bad: PaSearchProvider = {
      id: "duckduckgo",
      async search() {
        throw new PaSearchError("timeout", "boom", { provider: "duckduckgo" });
      },
    };
    const engine = createPaSearchEngine({ providers: [ok, bad] });
    const res = await engine.search({ query: "test query words" });
    assert.equal(res.results.length, 1);
    assert.equal(res.partialFailures.length, 1);
    assert.equal(res.partialFailures[0]!.provider, "duckduckgo");
  });

  it("all providers fail → all_providers_failed", async () => {
    const bad: PaSearchProvider = {
      id: "mojeek",
      async search() {
        throw new PaSearchError("http_error", "down", { provider: "mojeek" });
      },
    };
    const engine = createPaSearchEngine({ providers: [bad] });
    await assert.rejects(
      () => engine.search({ query: "x" }),
      (e: unknown) =>
        e instanceof PaSearchError && e.code === "all_providers_failed",
    );
  });
});

describe("legacy adapter", () => {
  it("mapea a SearchResponse", async () => {
    const engine = createPaSearchEngine({
      providers: [
        {
          id: "wikipedia",
          async search() {
            return [
              fakeResult({
                title: "T",
                url: "https://example.com/t",
                domain: "example.com",
                provider: "wikipedia",
              }),
            ];
          },
        },
      ],
    });
    const provider = createPersonalAgentSearchProvider({ engine });
    const res = await provider.search({ query: "hello world" });
    assert.equal(res.provider, "personal-agent-search");
    assert.equal(res.results[0]!.url, "https://example.com/t");
  });
});
