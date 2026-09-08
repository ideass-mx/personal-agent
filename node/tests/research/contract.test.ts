/**
 * Contrato research.search() — adapters HTTP locales normalizan al mismo shape.
 * Usa HTTP fake local (sin Internet).
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  createLibreyProvider,
  createWebsurfxProvider,
  createSearchRouter,
  researchSearch,
  SearchError,
  type SearchProvider,
  type SearchResponse,
} from "../../src/research/index.ts";
import {
  sendJson,
  sendRaw,
  startFakeServer,
  type FakeServer,
} from "./fake-http.ts";

function assertContractShape(
  res: SearchResponse,
  expectedProvider: string,
  expectedQuery: string,
): void {
  assert.equal(res.provider, expectedProvider);
  assert.equal(res.query, expectedQuery);
  assert.equal(typeof res.retrievedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(res.retrievedAt)));
  assert.ok(Array.isArray(res.results));
  for (const r of res.results) {
    assert.equal(typeof r.title, "string");
    assert.ok(r.title.length > 0);
    assert.equal(typeof r.url, "string");
    assert.ok(r.url.startsWith("http"));
    if (r.snippet !== undefined) assert.equal(typeof r.snippet, "string");
    if (r.domain !== undefined) assert.equal(typeof r.domain, "string");
    if (r.publishedAt !== undefined) {
      assert.equal(typeof r.publishedAt, "string");
    }
  }
}

describe("research.search contract", () => {
  const servers: FakeServer[] = [];

  after(async () => {
    for (const s of servers) {
      await s.close();
    }
  });

  it("Websurfx normaliza description→snippet (API real json=true)", async () => {
    const server = await startFakeServer((_req, res, url) => {
      assert.equal(url.pathname, "/search");
      assert.equal(url.searchParams.get("json"), "true");
      sendJson(res, 200, {
        results: [
          {
            title: "PostgreSQL 17",
            url: "https://www.postgresql.org/about/news/17",
            description: "Novedades de PostgreSQL 17",
            relevanceScore: 1.2,
            engine: ["duckduckgo"],
          },
        ],
        engineErrorsInfo: [],
        safeSearchLevel: 0,
      });
    });
    servers.push(server);

    const provider = createWebsurfxProvider({ baseUrl: server.baseUrl });
    const res = await provider.search({
      query: "PostgreSQL 17 novedades",
      limit: 5,
    });
    assertContractShape(res, "websurfx", "PostgreSQL 17 novedades");
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]!.snippet, "Novedades de PostgreSQL 17");
    assert.equal(res.results[0]!.domain, "www.postgresql.org");
  });

  it("LibreY normaliza array api.php (description + base_url)", async () => {
    const server = await startFakeServer((_req, res, url) => {
      assert.equal(url.pathname, "/api.php");
      assert.equal(url.searchParams.get("t"), "0");
      assert.equal(url.searchParams.get("p"), "0");
      sendJson(res, 200, [
        {
          title: "OpenAI news",
          url: "https://openai.com/blog",
          base_url: "https://openai.com/",
          description: "Últimas noticias",
        },
      ]);
    });
    servers.push(server);

    const provider = createLibreyProvider({ baseUrl: server.baseUrl });
    const res = await provider.search({
      query: "últimas noticias OpenAI",
      limit: 5,
    });
    assertContractShape(res, "librey", "últimas noticias OpenAI");
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]!.snippet, "Últimas noticias");
    assert.equal(res.results[0]!.domain, "openai.com");
  });

  it("providers HTTP locales comparten contrato vía router", async () => {
    const web = await startFakeServer((_req, res) => {
      sendJson(res, 200, {
        results: [
          {
            title: "B",
            url: "https://b.example/y",
            description: "sb",
          },
        ],
      });
    });
    const lib = await startFakeServer((_req, res) => {
      sendJson(res, 200, [
        {
          title: "C",
          url: "https://c.example/z",
          description: "sc",
        },
      ]);
    });
    servers.push(web, lib);

    const router = createSearchRouter({
      config: {
        provider: "websurfx",
        websurfxBaseUrl: web.baseUrl,
        libreyBaseUrl: lib.baseUrl,
        timeoutMs: 5_000,
        electronSerpEnabled: true,
        electronSerpIdleTimeoutMs: 300_000,
      },
    });

    for (const id of ["websurfx", "librey"] as const) {
      const res = await router.search({ query: "doctorados IA", limit: 3 }, id);
      assertContractShape(res, id, "doctorados IA");
      assert.equal(res.results.length, 1);
    }

    const viaEntry = await researchSearch(
      { query: "doctorados IA", limit: 3 },
      {
        config: {
          provider: "websurfx",
          websurfxBaseUrl: web.baseUrl,
          libreyBaseUrl: lib.baseUrl,
          timeoutMs: 5_000,
          electronSerpEnabled: true,
          electronSerpIdleTimeoutMs: 300_000,
        },
      },
    );
    assert.equal(viaEntry.provider, "websurfx");
  });

  it("respuesta vacía → results=[]", async () => {
    const cases: Array<{
      id: string;
      create: (base: string) => SearchProvider;
      body: unknown;
    }> = [
      {
        id: "websurfx",
        create: (b) => createWebsurfxProvider({ baseUrl: b }),
        body: { results: [] },
      },
      {
        id: "librey",
        create: (b) => createLibreyProvider({ baseUrl: b }),
        body: [],
      },
    ];

    for (const c of cases) {
      const server = await startFakeServer((_req, res) => {
        sendJson(res, 200, c.body);
      });
      servers.push(server);
      const res = await c.create(server.baseUrl).search({ query: "nada" });
      assert.equal(res.results.length, 0);
      assert.equal(res.provider, c.id);
      assert.equal(res.query, "nada");
    }
  });

  it("HTTP error → SearchError http_error", async () => {
    const server = await startFakeServer((_req, res) => {
      sendJson(res, 503, { error: "down" });
    });
    servers.push(server);
    const provider = createWebsurfxProvider({ baseUrl: server.baseUrl });
    await assert.rejects(
      () => provider.search({ query: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "http_error");
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it("JSON inválido → SearchError invalid_json", async () => {
    const server = await startFakeServer((_req, res) => {
      sendRaw(res, 200, "<html>not json</html>", "text/html");
    });
    servers.push(server);
    await assert.rejects(
      () =>
        createWebsurfxProvider({ baseUrl: server.baseUrl }).search({
          query: "x",
        }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "invalid_json");
        return true;
      },
    );
  });

  it("campos ausentes se omiten; no rompen el contrato", async () => {
    const server = await startFakeServer((_req, res) => {
      sendJson(res, 200, {
        results: [{ title: "Only title+url", url: "https://ex.test/a" }],
      });
    });
    servers.push(server);
    const res = await createWebsurfxProvider({
      baseUrl: server.baseUrl,
    }).search({ query: "q" });
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]!.snippet, undefined);
    assert.equal(res.results[0]!.publishedAt, undefined);
    assert.equal(res.results[0]!.domain, "ex.test");
  });

  it("timeout → SearchError timeout", async () => {
    const server = await startFakeServer((_req, res) => {
      setTimeout(() => sendJson(res, 200, { results: [] }), 5_000);
    });
    servers.push(server);
    await assert.rejects(
      () =>
        createLibreyProvider({
          baseUrl: server.baseUrl,
          timeoutMs: 50,
        }).search({ query: "slow" }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "timeout");
        return true;
      },
    );
  });

  it("AbortSignal → SearchError aborted|timeout", async () => {
    const server = await startFakeServer((_req, res) => {
      setTimeout(() => sendJson(res, 200, { results: [] }), 5_000);
    });
    servers.push(server);
    const ctrl = new AbortController();
    queueMicrotask(() => ctrl.abort());
    await assert.rejects(
      () =>
        createWebsurfxProvider({ baseUrl: server.baseUrl }).search({
          query: "cancel",
          signal: ctrl.signal,
        }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.ok(err.code === "aborted" || err.code === "timeout");
        return true;
      },
    );
  });

  it("query vacía → invalid_input", async () => {
    const provider = createWebsurfxProvider({
      baseUrl: "http://127.0.0.1:9",
    });
    await assert.rejects(
      () => provider.search({ query: "   " }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "invalid_input");
        return true;
      },
    );
  });

  it("LibreY {error} → provider_unavailable", async () => {
    const server = await startFakeServer((_req, res) => {
      sendJson(res, 200, { error: "disabled" });
    });
    servers.push(server);
    await assert.rejects(
      () =>
        createLibreyProvider({ baseUrl: server.baseUrl }).search({
          query: "x",
        }),
      (err: unknown) => {
        assert.ok(err instanceof SearchError);
        assert.equal(err.code, "provider_unavailable");
        return true;
      },
    );
  });
});
