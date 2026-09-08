/**
 * Tools research.search / research.fetch + presupuesto (determinista).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createResearchBudgetStore } from "../../src/research/budget.ts";
import { createResearchExtension } from "../../src/extensions/research.ts";
import { createDefaultToolRegistry } from "../../src/tools/defaults.ts";
import { createResearchFetchTool } from "../../src/tools/research-fetch.ts";
import { createResearchSearchTool } from "../../src/tools/research-search.ts";
import type { SearchResponse } from "../../src/research/types.ts";

describe("research tools + budget", () => {
  it("createDefaultToolRegistry registra research.search y research.fetch", () => {
    const registry = createDefaultToolRegistry();
    assert.ok(registry.get("research.search"));
    assert.ok(registry.get("research.fetch"));
    const ext = createResearchExtension();
    assert.equal(ext.name, "research");
    assert.equal(ext.tools.length, 2);
  });

  it("search tool normaliza resultados", async () => {
    const budget = createResearchBudgetStore();
    const tool = createResearchSearchTool({
      budget,
      search: async (query): Promise<SearchResponse> => ({
        query,
        provider: "web",
        retrievedAt: new Date().toISOString(),
        results: [
          {
            title: "UAQ",
            url: "https://www.uaq.mx/ia",
            snippet: "Doctorado",
            domain: "www.uaq.mx",
          },
        ],
      }),
    });
    const res = await tool.execute(
      { query: "doctorado IA México", limit: 5 },
      { conversationId: "c1" },
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      const content = res.content as {
        results: Array<{ title: string; url: string; source?: string }>;
      };
      assert.equal(content.results.length, 1);
      assert.equal(content.results[0]!.title, "UAQ");
      assert.equal(content.results[0]!.source, "www.uaq.mx");
    }
    const snap = budget.snapshot("c1");
    assert.equal(snap.searches, 1);
    assert.equal(snap.successfulSearches, 1);
  });

  it("provider failure no lanza; ToolResult error", async () => {
    const tool = createResearchSearchTool({
      budget: createResearchBudgetStore(),
      search: async () => {
        throw new Error("boom");
      },
    });
    const res = await tool.execute(
      { query: "x" },
      { conversationId: "c-fail" },
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, "provider_unavailable");
  });

  it("fetch tool con página inyectada", async () => {
    const tool = createResearchFetchTool({
      budget: createResearchBudgetStore(),
      fetchPage: async (url) => ({
        ok: true,
        url,
        finalUrl: url,
        title: "Ejemplo",
        text: "Texto de la fuente",
        truncated: false,
      }),
    });
    const res = await tool.execute(
      { url: "https://example.com/a" },
      { conversationId: "c2" },
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      const c = res.content as { text: string; title?: string };
      assert.equal(c.title, "Ejemplo");
      assert.match(c.text, /Texto/);
    }
  });

  it("límites max searches / fetches / total", async () => {
    const budget = createResearchBudgetStore({
      maxSearches: 2,
      maxFetches: 2,
      maxTotalWebOperations: 3,
    });
    const search = createResearchSearchTool({
      budget,
      search: async (q) => ({
        query: q,
        provider: "web",
        retrievedAt: new Date().toISOString(),
        results: [],
      }),
    });
    const fetch = createResearchFetchTool({
      budget,
      fetchPage: async (url) => ({
        ok: true,
        url,
        finalUrl: url,
        text: "ok",
        truncated: false,
      }),
    });
    const ctx = { conversationId: "lim" };
    assert.equal((await search.execute({ query: "a" }, ctx)).ok, true);
    assert.equal((await search.execute({ query: "b" }, ctx)).ok, true);
    const thirdSearch = await search.execute({ query: "c" }, ctx);
    assert.equal(thirdSearch.ok, false);
    if (!thirdSearch.ok) {
      assert.equal(thirdSearch.error.code, "web_research_limit_reached");
    }

    budget.reset("lim2");
    const ctx2 = { conversationId: "lim2" };
    assert.equal((await search.execute({ query: "a" }, ctx2)).ok, true);
    assert.equal(
      (await fetch.execute({ url: "https://example.com/1" }, ctx2)).ok,
      true,
    );
    assert.equal(
      (await fetch.execute({ url: "https://example.com/2" }, ctx2)).ok,
      true,
    );
    // total=3 ya consumido (1 search + 2 fetch) con maxTotal=3
    const over = await fetch.execute({ url: "https://example.com/3" }, ctx2);
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.error.code, "web_research_limit_reached");
  });

  it("secuencia iterativa search→fetch→search→fetch", async () => {
    const budget = createResearchBudgetStore();
    let searches = 0;
    const search = createResearchSearchTool({
      budget,
      search: async (q) => {
        searches += 1;
        return {
          query: q,
          provider: "web",
          retrievedAt: new Date().toISOString(),
          results: [
            {
              title: `R${searches}`,
              url: `https://example.com/${searches}`,
              snippet: "s",
              domain: "example.com",
            },
          ],
        };
      },
    });
    const fetch = createResearchFetchTool({
      budget,
      fetchPage: async (url) => ({
        ok: true,
        url,
        finalUrl: url,
        text: `body of ${url}`,
        truncated: false,
      }),
    });
    const ctx = { conversationId: "iter" };
    assert.equal((await search.execute({ query: "q1" }, ctx)).ok, true);
    assert.equal(
      (await fetch.execute({ url: "https://example.com/1" }, ctx)).ok,
      true,
    );
    assert.equal((await search.execute({ query: "q2" }, ctx)).ok, true);
    assert.equal(
      (await fetch.execute({ url: "https://example.com/2" }, ctx)).ok,
      true,
    );
    const snap = budget.snapshot("iter");
    assert.equal(snap.searches, 2);
    assert.equal(snap.fetches, 2);
    assert.equal(snap.sourcesUsed.length >= 2, true);
  });

  it("logs no contienen secretos obvios", async () => {
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: typeof process.stderr.write }).write = ((
      chunk: string | Uint8Array,
      ...args: unknown[]
    ) => {
      chunks.push(String(chunk));
      return (orig as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof process.stderr.write;

    try {
      process.env.HUB_TOKEN = "secret-hub-token-value";
      process.env.ANTHROPIC_API_KEY = "sk-ant-secret-test-key";
      const tool = createResearchSearchTool({
        budget: createResearchBudgetStore(),
        search: async (q) => ({
          query: q,
          provider: "web",
          retrievedAt: new Date().toISOString(),
          results: [],
        }),
      });
      await tool.execute({ query: "hola" }, { conversationId: "sec" });
      const joined = chunks.join("");
      assert.doesNotMatch(joined, /secret-hub-token-value/);
      assert.doesNotMatch(joined, /sk-ant-secret-test-key/);
      assert.doesNotMatch(joined, /HUB_TOKEN/);
      assert.doesNotMatch(joined, /ANTHROPIC_API_KEY/);
    } finally {
      process.stderr.write = orig;
      delete process.env.HUB_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
