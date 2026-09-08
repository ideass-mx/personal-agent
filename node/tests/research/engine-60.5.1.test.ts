/**
 * PHASE 60.12 — ResearchEngine productivo = Electron SERP.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createResearchEngine,
  createResearchBudgetStore,
  SearchError,
} from "../../src/research/index.ts";
import { createResearchSearchTool } from "../../src/tools/research-search.ts";
import { createElectronDuckDuckGoSerpAdapter } from "../../src/research/experimental/electron-serp/provider.ts";
import { createElectronDuckDuckGoSearchProvider } from "../../src/research/providers/electron-serp.ts";

describe("ResearchEngine Electron primary (60.12)", () => {
  it("search usa Electron inyectado", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "t",
          url: "https://duckduckgo.com/?q=UAQ",
          bodyText: "ok",
          links: [
            { href: "https://www.uaq.mx/", text: "UAQ doctorado oficial" },
          ],
        },
      }),
    });
    const electron = createElectronDuckDuckGoSearchProvider({ adapter });
    const engine = createResearchEngine({
      electronProvider: electron,
      enableStructuredProviders: false,
    });
    const res = await engine.search({ query: "UAQ IA" });
    assert.equal(res.provider, "web");
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]?.sourceFamily, "web");
    await engine.shutdown();
  });

  it("Electron unavailable → provider_unavailable (sin fallback silencioso)", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "",
          url: "about:blank",
          bodyText: "",
          links: [],
        },
        broken: true,
      }),
    });
    const electron = createElectronDuckDuckGoSearchProvider({ adapter });
    const engine = createResearchEngine({
      electronProvider: electron,
      enableStructuredProviders: false,
    });
    await assert.rejects(
      () => engine.search({ query: "test" }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.provider, "web");
        return true;
      },
    );
    await engine.shutdown();
  });

  it("tool research.search no intenta fallback", async () => {
    let calls = 0;
    const engine = createResearchEngine({
      search: async () => {
        calls += 1;
        throw new SearchError("provider_unavailable", "down", {
          provider: "electron-duckduckgo",
        });
      },
    });
    const tool = createResearchSearchTool({
      budget: createResearchBudgetStore(),
      engine,
    });
    const res = await tool.execute({ query: "x" }, { conversationId: "t1" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, "provider_unavailable");
    assert.equal(calls, 1);
  });

  it("search mock sigue funcionando en tests", async () => {
    const engine = createResearchEngine({
      search: async (req) => ({
        query: req.query,
        provider: "web",
        retrievedAt: new Date().toISOString(),
        results: [
          {
            title: "UAQ",
            url: "https://www.uaq.mx/",
            snippet: "doctorado",
            domain: "www.uaq.mx",
            sourceFamily: "web",
          },
        ],
      }),
    });
    const res = await engine.search({ query: "UAQ IA" });
    assert.equal(res.provider, "web");
  });
});
