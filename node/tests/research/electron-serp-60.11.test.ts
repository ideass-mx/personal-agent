/**
 * PHASE 60.11 — integración experimental Electron SERP en research.search.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createElectronDuckDuckGoSearchProvider,
  createElectronEnabledResearchEngine,
  createResearchEngine,
  createResearchBudgetStore,
  planQuery,
  SearchError,
  shutdownElectronSerp,
  resetSharedElectronSearchProviderForTests,
} from "../../src/research/index.ts";
import { createResearchSearchTool } from "../../src/tools/research-search.ts";
import { createElectronDuckDuckGoSerpAdapter } from "../../src/research/experimental/electron-serp/provider.ts";

describe("PHASE 60.11 research.search Electron integration", () => {
  it("Electron provider implements SearchProvider", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      mode: "reusable",
      searchFn: async (q) => ({
        extract: {
          title: "t",
          url: "https://duckduckgo.com/?q=" + encodeURIComponent(q),
          bodyText: "ok",
          links: [
            { href: "https://www.postgresql.org/", text: "PostgreSQL Official Site" },
            { href: "https://dev.to/pg", text: "Postgres article" },
          ],
        },
      }),
    });
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    assert.equal(provider.id, "electron-duckduckgo");
    const res = await provider.search({ query: "PostgreSQL 17", limit: 5 });
    assert.equal(res.provider, "electron-duckduckgo");
    assert.ok(res.results.some((r) => /postgresql\.org/i.test(r.url)));
    await provider.close();
  });

  it("engine default uses Electron path (mock search)", async () => {
    const engine = createResearchEngine({
      search: async (req) => ({
        query: req.query,
        provider: "electron-duckduckgo",
        retrievedAt: new Date().toISOString(),
        results: [{ title: "x", url: "https://example.com/", domain: "example.com" }],
      }),
    });
    const res = await engine.search({ query: "test" });
    assert.equal(res.provider, "electron-duckduckgo");
    await engine.shutdown();
  });

  it("engine Electron uses Electron without silent fallback", async () => {
    let electronCalls = 0;
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => {
        electronCalls += 1;
        return {
          extract: {
            title: "t",
            url: "https://duckduckgo.com/?q=x",
            bodyText: "challenge Please complete the following challenge bots use duckduckgo",
            links: [],
          },
        };
      },
    });
    const electron = createElectronDuckDuckGoSearchProvider({ adapter });
    const engine = createElectronEnabledResearchEngine(electron);
    await assert.rejects(
      () => engine.search({ query: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.provider, "electron-duckduckgo");
        return true;
      },
    );
    assert.equal(electronCalls, 1);
    await engine.shutdown();
  });

  it("QueryPlan preserves language/region for MX queries", () => {
    const plan = planQuery({
      query: "universidades doctorado IA México",
      language: "es",
      region: "mx",
    });
    assert.equal(plan.language, "es");
    assert.equal(plan.region?.toLowerCase(), "mx");
    assert.ok(
      plan.intent === "research" ||
        plan.intent === "local" ||
        plan.intent === "academic" ||
        plan.intent === "general",
    );
  });

  it("session reuses BrowserWindow across searches", async () => {
    let warmUps = 0;
    const adapter = createElectronDuckDuckGoSerpAdapter({
      mode: "reusable",
      searchFn: async (q) => ({
        extract: {
          title: "t",
          url: "https://duckduckgo.com/?q=" + q,
          bodyText: "ok",
          links: [{ href: "https://example.com/" + q, text: "Result for " + q }],
        },
      }),
    });
    const origWarm = adapter.warmUp.bind(adapter);
    adapter.warmUp = async () => {
      warmUps += 1;
      return origWarm();
    };
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter,
      idleTimeoutMs: 60_000,
    });
    await provider.search({ query: "A" });
    await provider.search({ query: "B" });
    await provider.search({ query: "C" });
    assert.equal(warmUps, 1);
    assert.equal(provider.isWarm(), true);
    await provider.close();
  });

  it("provider shutdown closes Electron", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "t",
          url: "https://duckduckgo.com/",
          bodyText: "ok",
          links: [{ href: "https://example.com/", text: "Ex result page" }],
        },
      }),
    });
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    await provider.search({ query: "x" });
    await provider.close();
    assert.equal(provider.isWarm(), false);
  });

  it("cancel search via AbortSignal", async () => {
    const ac = new AbortController();
    ac.abort();
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: { title: "", url: "", bodyText: "", links: [] },
      }),
    });
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    await assert.rejects(
      () => provider.search({ query: "x", signal: ac.signal }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "aborted");
        return true;
      },
    );
    await provider.close();
  });

  it("CAPTCHA → BLOCKED → provider_unavailable", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "Challenge",
          url: "https://duckduckgo.com/",
          bodyText: "Please complete the following challenge. Bots use DuckDuckGo too.",
          links: [],
        },
      }),
    });
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    await assert.rejects(
      () => provider.search({ query: "x" }),
      (e: unknown) => e instanceof SearchError && e.provider === "electron-duckduckgo",
    );
    await provider.close();
  });

  it("timeout → BROKEN → timeout error", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: { title: "", url: "about:blank", bodyText: "", links: [] },
        broken: true,
        latencyMs: 1,
      }),
    });
    // Force fingerprint timeout path via direct health broken
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    await assert.rejects(() => provider.search({ query: "x" }), SearchError);
    await provider.close();
  });

  it("tool hides electron-duckduckgo from LLM payload", async () => {
    const engine = createResearchEngine({
      electronProvider: {
        id: "electron-duckduckgo",
        async search(req) {
          return {
            query: req.query,
            provider: "electron-duckduckgo",
            retrievedAt: new Date().toISOString(),
            results: [
              {
                title: "PostgreSQL",
                url: "https://www.postgresql.org/",
                domain: "postgresql.org",
              },
            ],
          };
        },
        close: async () => undefined,
        isWarm: () => false,
        getRuntimeState: () => "COLD" as const,
      },
    });
    const tool = createResearchSearchTool({
      budget: createResearchBudgetStore(),
      engine,
    });
    const res = await tool.execute({ query: "PostgreSQL 17" }, { conversationId: "t" });
    assert.equal(res.ok, true);
    if (res.ok) {
      const content = res.content as { provider: string };
      assert.equal(content.provider, "web");
      assert.notEqual(content.provider, "electron-duckduckgo");
    }
    await engine.shutdown();
  });

  it("no secrets in electron search response", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "t",
          url: "https://duckduckgo.com/?q=PostgreSQL+17",
          bodyText: "ok",
          links: [{ href: "https://example.com/", text: "Example result title" }],
        },
      }),
    });
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    const res = await provider.search({ query: "PostgreSQL 17" });
    const s = JSON.stringify(res);
    assert.ok(!/"password"\s*:/.test(s));
    assert.ok(!/Set-Cookie/i.test(s));
    await provider.close();
  });

  it("shared shutdown clears singleton", async () => {
    resetSharedElectronSearchProviderForTests();
    await shutdownElectronSerp();
  });
});
