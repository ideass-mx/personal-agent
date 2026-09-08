/**
 * Tests deterministas del adapter experimental agent-search-mcp.
 * NO requieren Internet (searchFn inyectado).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentSearchMcpProvider,
  SearchError,
  type AgentSearchDiagnostics,
  type AgentSearchFn,
} from "../../src/research/index.ts";

describe("agent-search-mcp adapter (deterministic)", () => {
  it("normaliza title/url/snippet/domain/publishedAt", async () => {
    const diags: AgentSearchDiagnostics[] = [];
    const searchFn: AgentSearchFn = async () => ({
      query: "q",
      engines: ["duckduckgo", "wikipedia"],
      results: [
        {
          title: "Android Ed25519",
          url: "https://developer.android.com/ed25519",
          snippet: "API notes",
          evidence: { published_at: "2024-06-01T00:00:00Z" },
          sources: ["duckduckgo"],
        },
        {
          title: "Skip me",
          // url inválido → omitido
          url: "not-a-url",
        },
      ],
      partialFailures: [
        {
          engine: "mojeek",
          type: "timeout",
          message: "upstream timeout",
        },
      ],
      cache_hit: false,
      detected_language: "en",
    });

    const provider = createAgentSearchMcpProvider({
      searchFn,
      onDiagnostics: (d) => diags.push(d),
    });
    const res = await provider.search({ query: "Ed25519 Android API 29", limit: 5 });
    assert.equal(res.provider, "agent-search-mcp");
    assert.equal(res.query, "Ed25519 Android API 29");
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]!.title, "Android Ed25519");
    assert.equal(res.results[0]!.domain, "developer.android.com");
    assert.equal(res.results[0]!.snippet, "API notes");
    assert.equal(res.results[0]!.publishedAt, "2024-06-01T00:00:00Z");
    assert.equal(diags.length, 1);
    assert.deepEqual(diags[0]!.failedSources, ["mojeek"]);
    assert.equal(diags[0]!.sourceCount, 2);
    assert.equal(diags[0]!.partialFailures[0]!.type, "timeout");
  });

  it("respuesta vacía → results=[]", async () => {
    const provider = createAgentSearchMcpProvider({
      searchFn: async () => ({
        engines: ["duckduckgo"],
        results: [],
        partialFailures: [],
      }),
    });
    const res = await provider.search({ query: "nada" });
    assert.equal(res.results.length, 0);
  });

  it("query vacía → invalid_input", async () => {
    const provider = createAgentSearchMcpProvider({
      searchFn: async () => ({ results: [] }),
    });
    await assert.rejects(
      () => provider.search({ query: "  " }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "invalid_input");
        return true;
      },
    );
  });

  it("fallo total del searchFn → provider_unavailable", async () => {
    const provider = createAgentSearchMcpProvider({
      searchFn: async () => {
        throw new Error("boom");
      },
    });
    await assert.rejects(
      () => provider.search({ query: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "provider_unavailable");
        return true;
      },
    );
  });

  it("AbortSignal timeout → timeout", async () => {
    const provider = createAgentSearchMcpProvider({
      searchFn: async (opts) => {
        const signal = opts.signal;
        if (!signal) throw new Error("missing signal");
        await new Promise<never>((_, reject) => {
          const fail = () => {
            const e = new Error("aborted");
            e.name = "TimeoutError";
            reject(e);
          };
          if (signal.aborted) {
            fail();
            return;
          }
          signal.addEventListener("abort", fail, { once: true });
        });
        return { results: [] };
      },
    });
    const ctrl = new AbortController();
    const pending = provider.search({
      query: "slow",
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 15);
    await assert.rejects(
      () => pending,
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "timeout");
        return true;
      },
    );
  });
});
