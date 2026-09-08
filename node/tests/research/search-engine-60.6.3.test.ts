/**
 * Tests PHASE 60.6.3 — capabilities, position/agreement merge, selection.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agreementPositionSignal,
  classifySource,
  createPaSearchEngine,
  dedupeResults,
  facetsForPlan,
  getProviderCapabilities,
  planQuery,
  positionScore,
  rankResults,
  scoreProviderForPlan,
  selectProvidersForPlan,
  stripUnsupportedRequestFlags,
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

describe("ProviderCapabilities", () => {
  it("declara facets y no finge safeSearch", () => {
    const ddg = getProviderCapabilities("duckduckgo");
    assert.ok(ddg);
    assert.equal(ddg!.facets.general, true);
    assert.equal(ddg!.supportsSafeSearch, false);
    assert.equal(ddg!.stability, "fragile");
    const oa = getProviderCapabilities("openalex");
    assert.equal(oa!.facets.academic, true);
    assert.equal(oa!.supportsFreshness, true);
    assert.equal(oa!.stability, "stable");
  });

  it("stripUnsupportedRequestFlags no propaga safeSearch falso", () => {
    const flags = stripUnsupportedRequestFlags(["duckduckgo", "wikipedia"], {
      safeSearch: true,
    });
    assert.equal(flags.safeSearch, undefined);
  });
});

describe("capability-based selection", () => {
  const all = [
    "duckduckgo",
    "mojeek",
    "wikipedia",
    "arxiv",
    "openalex",
    "crossref",
  ] as const;

  it("academic scorea academic > general-web", () => {
    const plan = planQuery({
      query: "large language models research",
      intent: "academic",
    });
    const oa = scoreProviderForPlan(getProviderCapabilities("openalex")!, plan);
    const ddg = scoreProviderForPlan(
      getProviderCapabilities("duckduckgo")!,
      plan,
    );
    assert.ok(oa > ddg);
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(ids.includes("openalex"));
    assert.ok(!ids.includes("duckduckgo"));
  });

  it("facetsForPlan research incluye government/general", () => {
    const plan = planQuery({
      query: "doctorados IA México",
      intent: "research",
      language: "es",
      region: "MX",
    });
    const facets = facetsForPlan(plan);
    assert.ok(facets.includes("general"));
    assert.ok(facets.includes("academic"));
  });
});

describe("position + agreement", () => {
  it("positionScore favorece posiciones altas", () => {
    assert.ok(positionScore([{ position: 1 }]) > positionScore([{ position: 8 }]));
  });

  it("agreement no es absoluto frente a official alto", () => {
    const mediocre = agreementPositionSignal(3, [
      { position: 8 },
      { position: 9 },
      { position: 10 },
    ]);
    const official = agreementPositionSignal(1, [{ position: 1 }]);
    // combined mediocre agreement alto + pos baja vs agree 1 pos 1
    assert.ok(official.position > mediocre.position);
  });

  it("dedupe mergea hits y snippets", () => {
    const { results, duplicateCount } = dedupeResults([
      fakeResult({
        title: "UAQ",
        url: "https://www.uaq.mx/ia",
        domain: "www.uaq.mx",
        sourceType: "university",
        provider: "duckduckgo",
        providerPosition: 1,
        snippet: "corta",
      }),
      fakeResult({
        title: "UAQ Doctorado IA",
        url: "http://uaq.mx/ia?utm_source=x",
        domain: "uaq.mx",
        sourceType: "university",
        provider: "mojeek",
        providerPosition: 2,
        snippet: "snippet mucho mas largo sobre doctorado",
      }),
    ]);
    assert.equal(duplicateCount, 1);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.agreementCount, 2);
    assert.ok((results[0]!.providerHits?.length ?? 0) >= 2);
    assert.ok((results[0]!.snippet?.length ?? 0) > 10);
  });

  it("ranking usa agreement+position", () => {
    const plan = planQuery({ query: "MCP protocol", intent: "technical" });
    const shared = "https://modelcontextprotocol.io/";
    const merged = dedupeResults([
      fakeResult({
        title: "MCP",
        url: shared,
        domain: "modelcontextprotocol.io",
        sourceType: "documentation",
        provider: "duckduckgo",
        providerPosition: 1,
      }),
      fakeResult({
        title: "MCP docs",
        url: shared,
        domain: "modelcontextprotocol.io",
        sourceType: "documentation",
        provider: "wikipedia",
        providerPosition: 2,
      }),
    ]).results;
    const single = [
      fakeResult({
        title: "MCP other",
        url: "https://example.com/mcp",
        domain: "example.com",
        sourceType: "other",
        provider: "mojeek",
        providerPosition: 1,
        agreementCount: 1,
      }),
    ];
    const ranked = rankResults(plan.query, [...merged, ...single], { plan });
    assert.ok(ranked[0]!.url.includes("modelcontextprotocol.io"));
  });
});

describe("query plan freshness financial hoy", () => {
  it("precio NVIDIA hoy → day", () => {
    const plan = planQuery({
      query: "precio de NVIDIA hoy",
      language: "es",
      region: "MX",
    });
    assert.equal(plan.intent, "financial");
    assert.equal(plan.freshness, "day");
  });
});

describe("source quality unchanged rules", () => {
  it("gob/edu/ac; .mx no university", () => {
    assert.equal(classifySource("https://www.sat.gob.mx/"), "government");
    assert.equal(classifySource("https://ox.ac.uk/"), "university");
    assert.equal(classifySource("https://tienda.random.mx/x"), "other");
  });
});

describe("engine partial + positions", () => {
  it("anota positions y sobrevive fallos parciales", async () => {
    const a: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          fakeResult({
            title: "A",
            url: "https://es.wikipedia.org/wiki/A",
            domain: "es.wikipedia.org",
            provider: "wikipedia",
          }),
          fakeResult({
            title: "B",
            url: "https://es.wikipedia.org/wiki/B",
            domain: "es.wikipedia.org",
            provider: "wikipedia",
          }),
        ];
      },
    };
    const b: PaSearchProvider = {
      id: "duckduckgo",
      async search() {
        throw new PaSearchError("rate_limited", "x", { provider: "duckduckgo" });
      },
    };
    const engine = createPaSearchEngine({
      providers: [a, b],
      enableProviderSelection: false,
    });
    const res = await engine.search({ query: "test query words" });
    assert.ok(res.results.length >= 1);
    assert.ok(
      res.results.some((r) => (r.providerPosition ?? 0) >= 1),
    );
  });
});
