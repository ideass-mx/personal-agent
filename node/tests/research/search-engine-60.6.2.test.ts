/**
 * Tests PHASE 60.6.2 — query plan, provider selection, ranking, freshness.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDomainDiversity,
  classifySource,
  createPaSearchEngine,
  freshnessScore,
  inferIntent,
  planQuery,
  rankResults,
  selectProvidersForPlan,
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

describe("query planning", () => {
  it("infiere research / technical / financial", () => {
    assert.equal(
      inferIntent("mejores doctorados en inteligencia artificial en México"),
      "research",
    );
    assert.equal(
      inferIntent("React Server Components documentation"),
      "technical",
    );
    assert.equal(inferIntent("precio de NVIDIA hoy"), "financial");
  });

  it("plan incluye preferred sources y locale", () => {
    const plan = planQuery({
      query: "mejores doctorados en inteligencia artificial en México",
      language: "es",
      region: "MX",
    });
    assert.equal(plan.intent, "research");
    assert.equal(plan.language, "es");
    assert.equal(plan.region, "MX");
    assert.ok(plan.preferredSourceTypes.includes("university"));
    assert.ok(plan.preferredSourceTypes.includes("government"));
    assert.equal(plan.intentInferred, true);
  });

  it("respeta intent explícito", () => {
    const plan = planQuery({
      query: "precio de NVIDIA hoy",
      intent: "general",
    });
    assert.equal(plan.intent, "general");
    assert.equal(plan.intentInferred, false);
  });
});

describe("provider selection", () => {
  const all = [
    "duckduckgo",
    "mojeek",
    "wikipedia",
    "arxiv",
    "openalex",
    "crossref",
  ] as const;

  it("academic omite HTML general", () => {
    const plan = planQuery({
      query: "large language models research",
      intent: "academic",
    });
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(ids.includes("openalex"));
    assert.ok(ids.includes("arxiv"));
    assert.ok(!ids.includes("duckduckgo"));
    assert.ok(!ids.includes("mojeek"));
  });

  it("technical usa knowledge/technical sin OpenAlex safety net", () => {
    const plan = planQuery({
      query: "React documentation",
      intent: "technical",
    });
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(ids.includes("wikipedia") || ids.includes("duckduckgo"));
    assert.ok(!ids.includes("openalex"));
    assert.ok(!ids.includes("arxiv"));
  });

  it("research incluye academic cuando el plan lo pide", () => {
    const plan = planQuery({
      query: "doctorados IA México",
      intent: "research",
      language: "es",
      region: "MX",
    });
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(ids.includes("openalex"));
  });
});

describe("freshness", () => {
  it("news/financial priorizan reciente; evergreen no castiga", () => {
    const recent = new Date().toISOString();
    const old = "2015-01-01T00:00:00Z";
    assert.ok(freshnessScore(recent, "week") > freshnessScore(old, "week"));
    assert.ok(freshnessScore(old, "any") >= 0.5);
  });
});

describe("ranking signals 60.6.2", () => {
  it("preferencia university/gov en research ES/MX", () => {
    const plan = planQuery({
      query: "doctorado IA México",
      intent: "research",
      language: "es",
      region: "MX",
    });
    const ranked = rankResults(
      plan.query,
      [
        fakeResult({
          title: "Random blog IA",
          url: "https://random-blog.example/ia",
          domain: "random-blog.example",
          sourceType: "blog",
          provider: "mojeek",
        }),
        fakeResult({
          title: "Doctorado IA México UAQ",
          url: "https://www.uaq.mx/doctorado-ia",
          domain: "www.uaq.mx",
          sourceType: "university",
          provider: "duckduckgo",
          snippet: "doctorado inteligencia artificial",
        }),
      ],
      { plan },
    );
    assert.ok(ranked[0]!.url.includes("uaq.mx"));
  });

  it("agreement multi-provider sube score", () => {
    const plan = planQuery({ query: "MCP protocol", intent: "technical" });
    const url = "https://modelcontextprotocol.io/";
    const agreementByUrl = new Map([[url, 2]]);
    const withAgree = rankResults(
      plan.query,
      [
        fakeResult({
          title: "MCP protocol",
          url,
          domain: "modelcontextprotocol.io",
          sourceType: "documentation",
          provider: "duckduckgo",
        }),
      ],
      { plan, agreementByUrl },
    );
    const without = rankResults(
      plan.query,
      [
        fakeResult({
          title: "MCP protocol",
          url,
          domain: "modelcontextprotocol.io",
          sourceType: "documentation",
          provider: "duckduckgo",
        }),
      ],
      { plan },
    );
    assert.ok(withAgree[0]!.finalScore > without[0]!.finalScore);
  });
});

describe("source quality MX", () => {
  it("ac.* y sat/dof; .mx genérico no es university", () => {
    assert.equal(classifySource("https://ox.ac.uk/"), "university");
    assert.equal(classifySource("https://www.sat.gob.mx/"), "government");
    assert.equal(classifySource("https://www.dof.gob.mx/"), "government");
    assert.equal(classifySource("https://tienda.random.mx/x"), "other");
  });
});

describe("soft domain diversity", () => {
  it("prioriza alternativas; soft-max solo si no hay más dominios", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      fakeResult({
        title: `UAQ doctorado ${i}`,
        url: `https://www.uaq.mx/p${i}`,
        domain: "www.uaq.mx",
        sourceType: "university",
      }),
    );
    const alts = [
      fakeResult({
        title: "IPN doctorado",
        url: "https://www.ipn.mx/ia",
        domain: "www.ipn.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "UNAM doctorado",
        url: "https://www.unam.mx/ia",
        domain: "www.unam.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "SECIHTI",
        url: "https://www.secihti.mx/c",
        domain: "www.secihti.mx",
        sourceType: "government",
      }),
    ];
    const ranked = rankResults("doctorado IA", [...many, ...alts], {
      intent: "research",
      language: "es",
      region: "MX",
    });
    const div = applyDomainDiversity(ranked, {
      maxPerDomain: 2,
      softMaxPerDomain: 3,
      window: 5,
    });
    const top = div.slice(0, 5);
    assert.ok(top.some((r) => r.domain.includes("ipn.mx")));
    assert.ok(top.filter((r) => r.domain.includes("uaq.mx")).length <= 2);
  });
});

describe("engine plan + partial failure", () => {
  it("provider selection refleja plan; fallos parciales OK", async () => {
    const wiki: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          fakeResult({
            title: "React",
            url: "https://es.wikipedia.org/wiki/React",
            domain: "es.wikipedia.org",
            provider: "wikipedia",
          }),
        ];
      },
    };
    const ddg: PaSearchProvider = {
      id: "duckduckgo",
      async search() {
        throw new PaSearchError("rate_limited", "x", { provider: "duckduckgo" });
      },
    };
    const arxiv: PaSearchProvider = {
      id: "arxiv",
      async search() {
        return [
          fakeResult({
            title: "paper",
            url: "https://arxiv.org/abs/1",
            domain: "arxiv.org",
            sourceType: "academic",
            provider: "arxiv",
          }),
        ];
      },
    };
    const engine = createPaSearchEngine({
      providers: [wiki, ddg, arxiv],
    });
    const res = await engine.search({
      query: "React Server Components documentation",
      intent: "technical",
    });
    assert.ok(res.results.length >= 1);
    assert.equal(res.plan?.intent, "technical");
    assert.ok(res.plan?.selectedProviders.includes("wikipedia"));
    assert.ok(!res.plan?.selectedProviders.includes("arxiv"));
    assert.ok(!res.plan?.selectedProviders.includes("openalex"));
    assert.ok(
      res.providerReports.some(
        (r) => r.provider === "arxiv" && r.status === "unavailable",
      ),
    );
    assert.ok(
      res.providerReports.some(
        (r) => r.provider === "duckduckgo" && r.status === "rate_limited",
      ),
    );
  });

  it("all providers failed", async () => {
    const engine = createPaSearchEngine({
      providers: [
        {
          id: "mojeek",
          async search() {
            throw new PaSearchError("http_error", "x", { provider: "mojeek" });
          },
        },
      ],
    });
    await assert.rejects(
      () => engine.search({ query: "x", intent: "general" }),
      (e: unknown) =>
        e instanceof PaSearchError && e.code === "all_providers_failed",
    );
  });
});
