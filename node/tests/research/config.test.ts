/**
 * Config + router — PHASE 60.12 defaults (Electron primario).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadResearchSearchConfig,
  parseSearchProviderId,
  createSearchRouter,
  SearchError,
  type SearchProvider,
  type SearchResponse,
} from "../../src/research/index.ts";

describe("research config", () => {
  it("parseSearchProviderId acepta ids conocidos", () => {
    assert.equal(parseSearchProviderId("WEBSURFX"), "websurfx");
    assert.equal(parseSearchProviderId("librey"), "librey");
    assert.equal(parseSearchProviderId("agent-search-mcp"), "agent-search-mcp");
    assert.equal(parseSearchProviderId(undefined), "electron-duckduckgo");
  });

  it("parseSearchProviderId rechaza desconocidos", () => {
    assert.throws(() => parseSearchProviderId("bing"), /Unsupported search/);
    assert.throws(() => parseSearchProviderId("legacy-metasearch"), /Unsupported search/);
  });

  it("loadResearchSearchConfig lee env", () => {
    const cfg = loadResearchSearchConfig({
      SEARCH_PROVIDER: "librey",
      WEBSURFX_BASE_URL: "http://127.0.0.1:8081",
      LIBREY_BASE_URL: "http://127.0.0.1:8082",
      SEARCH_TIMEOUT_MS: "20000",
    });
    assert.equal(cfg.provider, "librey");
    assert.equal(cfg.websurfxBaseUrl, "http://127.0.0.1:8081");
    assert.equal(cfg.libreyBaseUrl, "http://127.0.0.1:8082");
    assert.equal(cfg.timeoutMs, 20_000);
    assert.equal(cfg.electronSerpEnabled, true);
    assert.equal(cfg.electronSerpIdleTimeoutMs, 5 * 60 * 1000);
  });

  it("ELECTRON_SERP_ENABLED deprecated default true", () => {
    assert.equal(loadResearchSearchConfig({}).electronSerpEnabled, true);
    assert.equal(
      loadResearchSearchConfig({ ELECTRON_SERP_ENABLED: "true" })
        .electronSerpEnabled,
      true,
    );
    assert.equal(
      loadResearchSearchConfig({ ELECTRON_SERP_ENABLED: "0" })
        .electronSerpEnabled,
      false,
    );
  });

  it("ELECTRON_SERP_IDLE_TIMEOUT_MS configurable", () => {
    assert.equal(
      loadResearchSearchConfig({ ELECTRON_SERP_IDLE_TIMEOUT_MS: "60000" })
        .electronSerpIdleTimeoutMs,
      60_000,
    );
    assert.equal(
      loadResearchSearchConfig({ ELECTRON_SERP_IDLE_TIMEOUT_MS: "0" })
        .electronSerpIdleTimeoutMs,
      0,
    );
  });

  it("default provider es electron-duckduckgo", () => {
    assert.equal(loadResearchSearchConfig({}).provider, "electron-duckduckgo");
  });

  it("parseSearchProviderId acepta electron-duckduckgo", () => {
    assert.equal(
      parseSearchProviderId("electron-duckduckgo"),
      "electron-duckduckgo",
    );
  });
});

describe("SearchRouter", () => {
  it("selecciona provider inyectado sin conocer implementación", async () => {
    const fake: SearchProvider = {
      id: "websurfx",
      async search(): Promise<SearchResponse> {
        return {
          query: "q",
          provider: "websurfx",
          results: [{ title: "t", url: "https://ex.test/" }],
          retrievedAt: new Date().toISOString(),
        };
      },
    };
    const router = createSearchRouter({
      config: {
        provider: "websurfx",
        timeoutMs: 1000,
        electronSerpEnabled: true,
        electronSerpIdleTimeoutMs: 300_000,
      },
      providers: { websurfx: fake },
    });
    const res = await router.search({ query: "q" });
    assert.equal(res.results[0]!.title, "t");
  });

  it("sin base URL → provider_unavailable", async () => {
    const router = createSearchRouter({
      config: {
        provider: "websurfx",
        timeoutMs: 1000,
        electronSerpEnabled: true,
        electronSerpIdleTimeoutMs: 300_000,
      },
    });
    await assert.rejects(
      () => router.search({ query: "q" }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "provider_unavailable");
        return true;
      },
    );
  });

  it("electron-duckduckgo no requiere feature flag (inyectado)", async () => {
    const fake: SearchProvider = {
      id: "electron-duckduckgo",
      async search(): Promise<SearchResponse> {
        return {
          query: "PostgreSQL 17",
          provider: "electron-duckduckgo",
          results: [
            {
              title: "PostgreSQL",
              url: "https://www.postgresql.org/",
              domain: "postgresql.org",
            },
          ],
          retrievedAt: new Date().toISOString(),
        };
      },
    };
    const router = createSearchRouter({
      config: {
        provider: "electron-duckduckgo",
        timeoutMs: 1000,
        electronSerpEnabled: false, // deprecated — ignored when injected
        electronSerpIdleTimeoutMs: 300_000,
      },
      providers: { "electron-duckduckgo": fake },
    });
    const res = await router.search({ query: "PostgreSQL 17" });
    assert.equal(res.provider, "electron-duckduckgo");
    assert.equal(res.results[0]!.domain, "postgresql.org");
  });
});
