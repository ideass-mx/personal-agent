/**
 * Tests PHASE 60.6.4 — general web layer (IA, HN, MX official) + no safety net.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPaSearchEngine,
  matchMxOfficialCatalog,
  parseDuckDuckGoInstantAnswer,
  parseHackerNewsHits,
  planQuery,
  selectProvidersForPlan,
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
    provider: "wikipedia",
    ...partial,
  };
}

describe("no OpenAlex safety net", () => {
  const all = [
    "duckduckgo",
    "duckduckgo-ia",
    "mojeek",
    "wikipedia",
    "hackernews",
    "mx-official",
    "arxiv",
    "openalex",
    "crossref",
  ] as const;

  it("general no selecciona OpenAlex", () => {
    const plan = planQuery({ query: "mejores laptops 2026", intent: "general" });
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(!ids.includes("openalex"));
    assert.ok(!ids.includes("arxiv"));
    assert.ok(ids.includes("wikipedia") || ids.includes("duckduckgo-ia"));
  });

  it("technical selecciona HN / wiki; no OpenAlex", () => {
    const plan = planQuery({
      query: "React Server Components documentation",
      intent: "technical",
    });
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(ids.includes("hackernews") || ids.includes("wikipedia"));
    assert.ok(!ids.includes("openalex"));
  });

  it("research sí puede incluir OpenAlex", () => {
    const plan = planQuery({
      query: "doctorado inteligencia artificial México",
      intent: "research",
      language: "es",
      region: "MX",
    });
    const ids = selectProvidersForPlan(plan, all);
    assert.ok(ids.includes("openalex"));
    assert.ok(ids.includes("mx-official"));
  });
});

describe("DuckDuckGo Instant Answer parser", () => {
  it("extrae AbstractURL y RelatedTopics", () => {
    const rows = parseDuckDuckGoInstantAnswer({
      Heading: "PostgreSQL",
      AbstractURL: "https://en.wikipedia.org/wiki/PostgreSQL",
      AbstractText: "Database",
      RelatedTopics: [
        { FirstURL: "https://www.postgresql.org/", Text: "Official site" },
      ],
      Results: [],
    });
    assert.ok(rows.length >= 2);
    assert.ok(rows.some((r) => r.url.includes("wikipedia.org")));
  });
});

describe("Hacker News parser", () => {
  it("usa url o story_url", () => {
    const rows = parseHackerNewsHits({
      hits: [
        {
          title: "RSC",
          url: "https://react.dev/blog",
          objectID: "1",
          author: "a",
          points: 10,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.url, "https://react.dev/blog");
  });
});

describe("MX official catalog", () => {
  it("matchea SAT / UAQ / SECIHTI", () => {
    const sat = matchMxOfficialCatalog("SAT declaración anual requisitos");
    assert.ok(sat.some((e) => e.id === "sat"));
    const uaq = matchMxOfficialCatalog("doctorado inteligencia artificial UAQ");
    assert.ok(uaq.some((e) => e.id === "uaq"));
    const sec = matchMxOfficialCatalog("SECIHTI convocatorias doctorado");
    assert.ok(sec.some((e) => e.id === "secihti"));
  });

  it("provider mx-official retorna government/university", async () => {
    const engine = createPaSearchEngine({
      providers: [
        {
          id: "mx-official",
          async search(req) {
            const { createMxOfficialProvider } = await import(
              "../../src/research/search/providers/mx-official.ts"
            );
            return createMxOfficialProvider().search(req);
          },
        } as PaSearchProvider,
      ],
      enableProviderSelection: false,
    });
    // Use real provider simpler:
    const { createMxOfficialProvider } = await import(
      "../../src/research/search/providers/mx-official.ts"
    );
    const p = createMxOfficialProvider();
    const rows = await p.search({
      query: "SAT declaración anual",
      language: "es",
      region: "MX",
    });
    assert.ok(rows.length >= 1);
    assert.equal(rows[0]!.sourceType, "government");
    assert.ok(rows[0]!.url.includes("sat.gob.mx"));
  });
});

describe("honest empty without safety net", () => {
  it("si solo falla el provider seleccionado → all_providers_failed", async () => {
    const empty: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [];
      },
    };
    const engine = createPaSearchEngine({
      providers: [empty],
      enableProviderSelection: false,
    });
    await assert.rejects(() => engine.search({ query: "xyzzy unlikely" }));
  });
});

describe("privacy: reports sin query text", () => {
  it("providerReports no incluyen query", async () => {
    const engine = createPaSearchEngine({
      providers: [
        {
          id: "wikipedia",
          async search() {
            return [
              fakeResult({
                title: "Ok",
                url: "https://example.com/a",
                domain: "example.com",
                provider: "wikipedia",
              }),
            ];
          },
        },
      ],
      enableProviderSelection: false,
    });
    const res = await engine.search({
      query: "secret password token Authorization Bearer",
    });
    const blob = JSON.stringify(res.providerReports);
    assert.equal(blob.includes("secret password"), false);
    assert.equal(blob.includes("Authorization"), false);
  });
});
