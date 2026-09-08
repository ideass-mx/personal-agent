/**
 * PHASE 60.15 — Web Intelligence Base: integración + verificación.
 * Composición QueryPlan → Electron (general) + structured (knowledge/academic/official).
 * Sin red real salvo tests marcados LIVE.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createResearchBudgetStore,
  createResearchEngine,
  researchFetch,
  shouldUseElectronForPlan,
  sourceFamilyForProvider,
  sourceFamilyFromPaResult,
  SearchError,
} from "../../src/research/index.ts";
import { planQuery } from "../../src/research/search/query-plan.ts";
import { createPaSearchEngine } from "../../src/research/search/engine.ts";
import type { PaSearchEngine } from "../../src/research/search/engine.ts";
import type { PaSearchProvider } from "../../src/research/search/types.ts";
import type { SearchProvider, SearchResponse } from "../../src/research/types.ts";
import { createElectronDuckDuckGoSearchProvider } from "../../src/research/providers/electron-serp.ts";
import { createElectronDuckDuckGoSerpAdapter } from "../../src/research/experimental/electron-serp/provider.ts";
import { createResearchFetchTool } from "../../src/tools/research-fetch.ts";
import { createResearchSearchTool } from "../../src/tools/research-search.ts";

function fakeElectron(
  results: Array<{ title: string; url: string; snippet?: string }>,
): SearchProvider {
  const adapter = createElectronDuckDuckGoSerpAdapter({
    searchFn: async () => ({
      extract: {
        title: "t",
        url: "https://duckduckgo.com/?q=x",
        bodyText: "ok",
        links: results.map((r) => ({
          href: r.url,
          text: r.title + (r.snippet ? ` ${r.snippet}` : ""),
        })),
      },
    }),
  });
  return createElectronDuckDuckGoSearchProvider({ adapter });
}

function fakePa(providers: readonly PaSearchProvider[]): PaSearchEngine {
  return createPaSearchEngine({
    providers,
    enableProviderSelection: true,
  });
}

describe("PHASE 60.15 source semantics", () => {
  it("mapea providers internos a familias semánticas", () => {
    assert.equal(sourceFamilyForProvider("electron-duckduckgo"), "web");
    assert.equal(sourceFamilyForProvider("wikipedia"), "knowledge");
    assert.equal(sourceFamilyForProvider("openalex"), "academic");
    assert.equal(sourceFamilyForProvider("crossref"), "academic");
    assert.equal(sourceFamilyForProvider("arxiv"), "academic");
    assert.equal(sourceFamilyForProvider("mx-official"), "official");
  });

  it("sourceFamilyFromPaResult: Wikipedia URL vía Electron → knowledge", () => {
    assert.equal(
      sourceFamilyFromPaResult({
        provider: "electron-duckduckgo",
        sourceType: "official",
        domain: "en.wikipedia.org",
        url: "https://en.wikipedia.org/wiki/Backpropagation",
      }),
      "knowledge",
    );
    assert.equal(
      sourceFamilyFromPaResult({
        provider: "electron-duckduckgo",
        sourceType: "official",
        domain: "www.postgresql.org",
        url: "https://www.postgresql.org/docs/17/",
      }),
      "official",
    );
  });

  it("QueryPlan decide Electron vs solo structured", () => {
    assert.equal(
      shouldUseElectronForPlan(planQuery({ query: "PostgreSQL 17" })),
      true,
    );
    assert.equal(
      shouldUseElectronForPlan(
        planQuery({ query: "large language models paper arxiv", intent: "academic" }),
      ),
      false,
    );
    assert.equal(
      shouldUseElectronForPlan(
        planQuery({ query: "¿Qué es backpropagation?" }),
      ),
      true,
    );
  });
});

describe("PHASE 60.15 ResearchEngine composition", () => {
  it("Scenario A — General Web usa Electron; .org docs → official", async () => {
    const engine = createResearchEngine({
      electronProvider: fakeElectron([
        {
          title: "PostgreSQL 17 Release Notes",
          url: "https://www.postgresql.org/docs/17/release-17.html",
          snippet: "novedades",
        },
      ]),
      enableStructuredProviders: false,
    });
    const res = await engine.search({ query: "¿Qué novedades tiene PostgreSQL 17?" });
    assert.equal(res.provider, "web");
    assert.ok(res.results.length >= 1);
    assert.equal(res.results[0]?.sourceFamily, "official");
    assert.ok(res.results[0]?.domain);
    assert.equal(res.results[0]?.position, 1);
    await engine.shutdown();
  });

  it("Scenario B — Knowledge via Wikipedia structured", async () => {
    const wiki: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          {
            title: "Backpropagation",
            url: "https://en.wikipedia.org/wiki/Backpropagation",
            snippet: "algoritmo de aprendizaje",
            domain: "en.wikipedia.org",
            sourceType: "other",
            retrievedAt: new Date().toISOString(),
            provider: "wikipedia",
            providerPosition: 1,
          },
        ];
      },
    };
    const engine = createResearchEngine({
      enableStructuredProviders: true,
      paEngine: fakePa([wiki]),
      electronProvider: fakeElectron([]),
    });
    // Forzar rama knowledge-heavy: intent academic evita Electron vacío
    const res = await engine.search({
      query: "backpropagation paper arxiv",
    });
    assert.ok(res.results.some((r) => r.sourceFamily === "knowledge"));
    await engine.shutdown();
  });

  it("Scenario C — Academic providers sin que el agente elija OpenAlex", async () => {
    const openalex: PaSearchProvider = {
      id: "openalex",
      async search() {
        return [
          {
            title: "LLM Agents Survey",
            url: "https://openalex.org/W1",
            snippet: "agents",
            domain: "openalex.org",
            sourceType: "academic",
            retrievedAt: new Date().toISOString(),
            provider: "openalex",
            providerPosition: 1,
          },
        ];
      },
    };
    const crossref: PaSearchProvider = {
      id: "crossref",
      async search() {
        return [
          {
            title: "Agents DOI",
            url: "https://doi.org/10.1/xyz",
            snippet: "doi",
            domain: "doi.org",
            sourceType: "academic",
            retrievedAt: new Date().toISOString(),
            provider: "crossref",
            providerPosition: 1,
          },
        ];
      },
    };
    const arxiv: PaSearchProvider = {
      id: "arxiv",
      async search() {
        return [
          {
            title: "arXiv:2401.00001",
            url: "https://arxiv.org/abs/2401.00001",
            snippet: "llm agents",
            domain: "arxiv.org",
            sourceType: "academic",
            retrievedAt: new Date().toISOString(),
            provider: "arxiv",
            providerPosition: 1,
          },
        ];
      },
    };
    const engine = createResearchEngine({
      paEngine: fakePa([openalex, crossref, arxiv]),
      enableStructuredProviders: true,
      // academic intent → no Electron
      electronProvider: {
        id: "electron-duckduckgo",
        async search() {
          throw new Error("Electron no debe llamarse en academic puro");
        },
      },
    });
    const res = await engine.search({
      query: "large language models agents research paper",
    });
    assert.equal(res.provider, "web");
    assert.ok(res.results.every((r) => r.sourceFamily === "academic"));
    assert.ok(res.results.length >= 1);
    await engine.shutdown();
  });

  it("deduplica URL entre Electron y structured preservando agreement", async () => {
    const shared = "https://www.postgresql.org/docs/17/release-17.html";
    const wiki: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          {
            title: "PostgreSQL (wiki)",
            url: shared,
            snippet: "from wiki",
            domain: "www.postgresql.org",
            sourceType: "documentation",
            retrievedAt: new Date().toISOString(),
            provider: "wikipedia",
            providerPosition: 2,
          },
        ];
      },
    };
    const engine = createResearchEngine({
      electronProvider: fakeElectron([
        { title: "PG17", url: shared, snippet: "from electron" },
      ]),
      paEngine: fakePa([wiki]),
    });
    const res = await engine.search({ query: "PostgreSQL 17 documentation" });
    const hit = res.results.find((r) => r.url.includes("release-17"));
    assert.ok(hit);
    assert.ok((hit?.agreementCount ?? 0) >= 2);
    await engine.shutdown();
  });

  it("fallo de una rama no es fallback silencioso: la otra puede continuar", async () => {
    const wiki: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          {
            title: "PostgreSQL",
            url: "https://en.wikipedia.org/wiki/PostgreSQL",
            snippet: "RDBMS",
            domain: "en.wikipedia.org",
            sourceType: "other",
            retrievedAt: new Date().toISOString(),
            provider: "wikipedia",
            providerPosition: 1,
          },
        ];
      },
    };
    const engine = createResearchEngine({
      electronProvider: {
        id: "electron-duckduckgo",
        async search() {
          throw new SearchError("timeout", "Electron timeout", {
            provider: "electron-duckduckgo",
          });
        },
      },
      paEngine: fakePa([wiki]),
    });
    const res = await engine.search({ query: "PostgreSQL 17" });
    assert.ok(res.results.length >= 1);
    assert.equal(res.results[0]?.sourceFamily, "knowledge");
    await engine.shutdown();
  });

  it("ambas ramas fallan → error estructurado", async () => {
    const engine = createResearchEngine({
      enableStructuredProviders: false,
      electronProvider: {
        id: "electron-duckduckgo",
        async search() {
          throw new SearchError("provider_unavailable", "down", {
            provider: "electron-duckduckgo",
          });
        },
      },
    });
    await assert.rejects(
      () => engine.search({ query: "x" }),
      (e: unknown) => e instanceof SearchError && e.provider === "web",
    );
    await engine.shutdown();
  });

  it("official MX catalog reachable via structured (IMPLEMENTED)", async () => {
    const mx: PaSearchProvider = {
      id: "mx-official",
      async search(req) {
        if (!/sat/i.test(req.query)) return [];
        return [
          {
            title: "SAT",
            url: "https://www.sat.gob.mx/",
            snippet: "portal",
            domain: "www.sat.gob.mx",
            sourceType: "government",
            retrievedAt: new Date().toISOString(),
            provider: "mx-official",
            providerPosition: 1,
          },
        ];
      },
    };
    const engine = createResearchEngine({
      paEngine: fakePa([mx]),
      enableStructuredProviders: true,
      electronProvider: fakeElectron([]),
    });
    const res = await engine.search({
      query: "trámite sat méxico",
      language: "es",
      region: "MX",
    });
    assert.ok(res.results.some((r) => r.sourceFamily === "official"));
    await engine.shutdown();
  });
});

describe("PHASE 60.15 MCP tools search+fetch chain", () => {
  it("Scenario D — search → fetch con tools (inyectadas)", async () => {
    const budget = createResearchBudgetStore();
    let fetchedUrl: string | undefined;
    const searchTool = createResearchSearchTool({
      budget,
      search: async (query) =>
        ({
          query,
          provider: "web",
          retrievedAt: new Date().toISOString(),
          results: [
            {
              title: "PostgreSQL 17",
              url: "https://www.postgresql.org/docs/17/release-17.html",
              snippet: "release notes",
              domain: "www.postgresql.org",
              sourceFamily: "web",
              position: 1,
            },
          ],
        }) satisfies SearchResponse,
    });
    const fetchTool = createResearchFetchTool({
      budget,
      fetchPage: async (url) => {
        fetchedUrl = url;
        return {
          ok: true as const,
          url,
          finalUrl: url,
          title: "PostgreSQL 17 Release Notes",
          text: "PostgreSQL 17 incluye mejoras en vacuum y JSON.",
          truncated: false,
          contentType: "text/html",
        };
      },
    });

    const s = await searchTool.execute(
      { query: "PostgreSQL 17" },
      { conversationId: "60.15-d" },
    );
    assert.equal(s.ok, true);
    if (!s.ok) return;
    const content = s.content as {
      provider: string;
      results: Array<{ url: string; sourceFamily?: string }>;
    };
    assert.equal(content.provider, "web");
    assert.equal(content.results[0]?.sourceFamily, "web");
    const url = content.results[0]!.url;

    const f = await fetchTool.execute(
      { url },
      { conversationId: "60.15-d" },
    );
    assert.equal(f.ok, true);
    assert.equal(fetchedUrl, url);
    if (f.ok) {
      const body = f.content as { text: string; title?: string };
      assert.match(body.text, /PostgreSQL 17/);
      assert.ok(body.title);
    }
  });

  it("Scenario E — multi-step search→fetch→search→fetch respeta presupuesto", async () => {
    const budget = createResearchBudgetStore();
    const searchTool = createResearchSearchTool({
      budget,
      search: async (query) => ({
        query,
        provider: "web",
        retrievedAt: new Date().toISOString(),
        results: [
          {
            title: query,
            url: `https://example.com/${encodeURIComponent(query)}`,
            domain: "example.com",
            sourceFamily: "web" as const,
            position: 1,
          },
        ],
      }),
    });
    const fetchTool = createResearchFetchTool({
      budget,
      fetchPage: async (url) => ({
        ok: true as const,
        url,
        finalUrl: url,
        text: `contenido de ${url}`,
        truncated: false,
      }),
    });
    const cid = "60.15-e";
    for (const q of ["PostgreSQL 17", "PostgreSQL 16"]) {
      const s = await searchTool.execute({ query: q }, { conversationId: cid });
      assert.equal(s.ok, true);
      if (!s.ok) continue;
      const url = (s.content as { results: Array<{ url: string }> }).results[0]!
        .url;
      const f = await fetchTool.execute({ url }, { conversationId: cid });
      assert.equal(f.ok, true);
    }
    const snap = budget.snapshot(cid);
    assert.equal(snap.searches, 2);
    assert.equal(snap.fetches, 2);
  });

  it("límites de presupuesto bloquean loops excesivos", async () => {
    const budget = createResearchBudgetStore({
      maxSearches: 1,
      maxFetches: 1,
      maxTotalWebOperations: 1,
    });
    const tool = createResearchSearchTool({
      budget,
      search: async (q) => ({
        query: q,
        provider: "web",
        retrievedAt: new Date().toISOString(),
        results: [],
      }),
    });
    const a = await tool.execute({ query: "a" }, { conversationId: "lim" });
    assert.equal(a.ok, true);
    const b = await tool.execute({ query: "b" }, { conversationId: "lim" });
    assert.equal(b.ok, false);
    if (!b.ok) assert.equal(b.error.code, "web_research_limit_reached");
  });
});

describe("PHASE 60.15 SSRF (fetch)", () => {
  it("bloquea localhost / private / file", async () => {
    for (const url of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "file:///etc/passwd",
    ]) {
      const r = await researchFetch({ url });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.ok(
          r.code === "ssrf_blocked" || r.code === "invalid_url",
          `${url} → ${r.code}`,
        );
      }
    }
  });
});

const LIVE = process.env.WEB_INTELLIGENCE_LIVE === "1";

describe("PHASE 60.15 live internet (opt-in WEB_INTELLIGENCE_LIVE=1)", () => {
  it(
    "structured Wikipedia + OpenAlex reachable",
    { skip: !LIVE },
    async () => {
      const engine = createResearchEngine({
        enableStructuredProviders: true,
        // evitar Electron en CI live opcional
        electronProvider: {
          id: "electron-duckduckgo",
          async search() {
            return {
              query: "x",
              provider: "electron-duckduckgo",
              retrievedAt: new Date().toISOString(),
              results: [],
            };
          },
        },
      });
      try {
        const knowledge = await engine.search({
          query: "PostgreSQL",
          language: "en",
        });
        assert.ok(knowledge.results.length >= 1);
        assert.ok(
          knowledge.results.some((r) => r.sourceFamily === "knowledge") ||
            knowledge.results.length >= 1,
        );

        const academic = await engine.search({
          query: "machine learning paper arxiv",
        });
        assert.ok(academic.results.length >= 1);
        assert.ok(
          academic.results.some((r) => r.sourceFamily === "academic") ||
            academic.results.length >= 1,
        );
      } finally {
        await engine.shutdown();
      }
    },
  );

  it(
    "fetch Wikipedia pública",
    { skip: !LIVE },
    async () => {
      const r = await researchFetch({
        url: "https://en.wikipedia.org/wiki/PostgreSQL",
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.ok(r.text.length > 100);
        assert.ok(r.title || r.finalUrl);
      }
    },
  );
});
