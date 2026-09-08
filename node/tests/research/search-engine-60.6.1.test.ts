/**
 * Tests PHASE 60.6.1 — providers, ranking intent-aware, ES/MX, diversidad.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDomainDiversity,
  canonicalizeUrl,
  classifySource,
  createDuckDuckGoProvider,
  createMojeekProvider,
  createPaSearchEngine,
  detectDuckDuckGoBlock,
  detectMojeekBlock,
  domainQualityScore,
  dedupeResults,
  parseDuckDuckGoHtml,
  parseMojeekHtml,
  rankResults,
  urlDedupeKey,
  PaSearchError,
  type PaSearchProvider,
  type PaSearchResult,
  type SearchIntent,
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

describe("DuckDuckGo parser + status", () => {
  it("normal response", () => {
    const html = `
      <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.uaq.mx%2Fia">UAQ IA</a>
      <a class="result__snippet">Doctorado</a>
    `;
    const rows = parseDuckDuckGoHtml(html, 200);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.url, "https://www.uaq.mx/ia");
  });

  it("empty results sin challenge", () => {
    const rows = parseDuckDuckGoHtml("<html><body>no results here</body></html>", 200);
    assert.equal(rows.length, 0);
  });

  it("rate limit / anomaly", () => {
    assert.equal(
      detectDuckDuckGoBlock(
        `<html>anomaly.js?sv=html&cc=botnet Please complete the challenge</html>`,
        202,
      ),
      true,
    );
    assert.throws(
      () =>
        parseDuckDuckGoHtml(
          `<html><script src="anomaly.js?cc=botnet"></script>Please complete</html>`,
          202,
        ),
      (e: unknown) => e instanceof PaSearchError && e.code === "rate_limited",
    );
  });

  it("malformed HTML con señales de resultados → parse_error", () => {
    assert.throws(
      () =>
        parseDuckDuckGoHtml(
          `<html>${"x".repeat(2500)}<div class="result__body">broken</div></html>`,
          200,
        ),
      (e: unknown) => e instanceof PaSearchError && e.code === "parse_error",
    );
  });

  it("timeout + cancellation", async () => {
    const provider = createDuckDuckGoProvider({ timeoutMs: 50, maxRetries: 0 });
    const ctrl = new AbortController();
    ctrl.abort();
    await assert.rejects(
      () =>
        provider.search({
          query: "test query",
          signal: ctrl.signal,
        }),
      (e: unknown) =>
        e instanceof PaSearchError &&
        (e.code === "aborted" || e.code === "timeout"),
    );

    // Timeout artificial vía AbortSignal timeout-like: provider con URL inalcanzable
    // se cubre en integración; aquí verificamos que AbortError de signal corto clasifica.
    const p2 = createDuckDuckGoProvider({ timeoutMs: 1, maxRetries: 0 });
    await assert.rejects(
      () => p2.search({ query: "timeout probe unlikely host" }),
      (e: unknown) =>
        e instanceof PaSearchError &&
        (e.code === "timeout" ||
          e.code === "http_error" ||
          e.code === "rate_limited" ||
          e.code === "parse_error" ||
          e.code === "aborted"),
    );
  });
});

describe("Mojeek parser + status", () => {
  it("normal response", () => {
    const html = `
      <ul class="results-standard">
        <li><a class="ob" href="https://www.ipn.mx/ia">IPN IA</a>
        <p class="s">Doctorado</p></li>
      </ul>
    `;
    const rows = parseMojeekHtml(html, 200);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.url, "https://www.ipn.mx/ia");
  });

  it("empty", () => {
    assert.equal(parseMojeekHtml("<html><body>nada</body></html>", 200).length, 0);
  });

  it("rate limit / captcha", () => {
    assert.equal(
      detectMojeekBlock(`<!DOCTYPE html><title>Captcha</title><body>captcha</body>`, 200),
      true,
    );
    assert.throws(
      () => parseMojeekHtml(`<title>Captcha</title><body>captcha form</body>`, 200),
      (e: unknown) => e instanceof PaSearchError && e.code === "rate_limited",
    );
  });

  it("malformed HTML → parse_error", () => {
    assert.throws(
      () =>
        parseMojeekHtml(
          `<html>${"y".repeat(2500)}<div id="results" class="results-standard">no links</div></html>`,
          200,
        ),
      (e: unknown) => e instanceof PaSearchError && e.code === "parse_error",
    );
  });

  it("timeout + cancellation", async () => {
    const provider = createMojeekProvider({ timeoutMs: 50, maxRetries: 0 });
    const ctrl = new AbortController();
    ctrl.abort();
    await assert.rejects(
      () => provider.search({ query: "test", signal: ctrl.signal }),
      (e: unknown) =>
        e instanceof PaSearchError &&
        (e.code === "aborted" || e.code === "timeout"),
    );
  });
});

describe("intent-aware ranking", () => {
  const intents: SearchIntent[] = [
    "general",
    "research",
    "academic",
    "technical",
    "news",
    "financial",
    "local",
  ];

  for (const intent of intents) {
    it(`ranking determinista: ${intent}`, () => {
      const a = fakeResult({
        title: "AI research paper arxiv",
        url: "https://arxiv.org/abs/1",
        domain: "arxiv.org",
        sourceType: "academic",
        provider: "arxiv",
        publishedAt: "2020-01-01T00:00:00Z",
      });
      const b = fakeResult({
        title: "Breaking news AI agents",
        url: "https://www.reuters.com/ai",
        domain: "www.reuters.com",
        sourceType: "news",
        provider: "duckduckgo",
        publishedAt: new Date().toISOString(),
      });
      const c = fakeResult({
        title: "React documentation oficial",
        url: "https://react.dev/learn",
        domain: "react.dev",
        sourceType: "documentation",
        provider: "mojeek",
      });
      const d = fakeResult({
        title: "SECIHTI convocatoria doctorado",
        url: "https://www.secihti.mx/conv",
        domain: "www.secihti.mx",
        sourceType: "government",
        provider: "mojeek",
      });
      const query =
        intent === "technical"
          ? "React documentation oficial"
          : intent === "news"
            ? "Breaking news AI agents"
            : intent === "academic"
              ? "AI research paper"
              : "AI agents research SECIHTI convocatoria";
      const ranked = rankResults(query, [a, b, c, d], {
        intent,
        language: "es",
        region: "MX",
      });
      assert.equal(ranked.length, 4);
      // Determinismo: misma entrada → mismo orden
      const again = rankResults(query, [a, b, c, d], {
        intent,
        language: "es",
        region: "MX",
      });
      assert.deepEqual(
        ranked.map((r) => r.url),
        again.map((r) => r.url),
      );
      if (intent === "academic") {
        assert.ok(ranked[0]!.url.includes("arxiv.org"));
      }
      if (intent === "news") {
        assert.ok(ranked[0]!.url.includes("reuters.com"));
      }
      if (intent === "technical") {
        assert.ok(ranked[0]!.url.includes("react.dev"));
      }
      if (intent === "research" || intent === "local") {
        assert.ok(ranked.some((r) => r.url.includes("secihti.mx")));
        // gov no debe quedar último en research/local
        const govIdx = ranked.findIndex((r) => r.url.includes("secihti"));
        assert.ok(govIdx >= 0 && govIdx <= 2);
      }
    });
  }
});

describe("ES/MX source classification", () => {
  it("gob.mx / edu.mx / universities / academic", () => {
    assert.equal(classifySource("https://www.gob.mx/sep"), "government");
    assert.equal(classifySource("https://www.secihti.mx/x"), "government");
    assert.equal(classifySource("https://www.conahcyt.mx/y"), "government");
    assert.equal(classifySource("https://www.unam.mx/"), "university");
    assert.equal(classifySource("https://www.ipn.mx/"), "university");
    assert.equal(classifySource("https://www.uaq.mx/posgrado"), "university");
    assert.equal(classifySource("https://www.escuela.edu.mx/"), "university");
    assert.equal(classifySource("https://arxiv.org/abs/1"), "academic");
    // .mx genérico NO es university
    assert.equal(classifySource("https://tienda.random.mx/producto"), "other");
  });

  it("domain quality", () => {
    assert.ok(domainQualityScore("https://www.secihti.mx/") > 0.9);
    assert.ok(domainQualityScore("https://www.uaq.mx/") > 0.9);
    assert.ok(domainQualityScore("https://arxiv.org/abs/1") > 0.9);
    assert.ok(domainQualityScore("https://random-blog.example/x") < 0.7);
  });
});

describe("domain diversity", () => {
  it("un dominio no monopoliza el top N", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      fakeResult({
        title: `UAQ ${i} doctorado IA`,
        url: `https://www.uaq.mx/page-${i}`,
        domain: "www.uaq.mx",
        sourceType: "university",
        provider: "mojeek",
      }),
    );
    const others = [
      fakeResult({
        title: "IPN doctorado IA",
        url: "https://www.ipn.mx/ia",
        domain: "www.ipn.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "UNAM IA",
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
      fakeResult({
        title: "CINVESTAV IA",
        url: "https://www.cinvestav.mx/ia",
        domain: "www.cinvestav.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "Gob MX educación",
        url: "https://www.gob.mx/educacion",
        domain: "www.gob.mx",
        sourceType: "government",
      }),
      fakeResult({
        title: "COLMEX posgrado",
        url: "https://www.colmex.mx/posgrado",
        domain: "www.colmex.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "Tec de Monterrey IA",
        url: "https://www.tec.mx/ia",
        domain: "www.tec.mx",
        sourceType: "university",
      }),
      fakeResult({
        title: "CONAHCYT becas",
        url: "https://conahcyt.mx/becas",
        domain: "conahcyt.mx",
        sourceType: "government",
      }),
    ];
    const ranked = rankResults("doctorado IA México", [...many, ...others], {
      intent: "research",
      region: "MX",
      language: "es",
    });
    const diversified = applyDomainDiversity(ranked, {
      maxPerDomain: 2,
      window: 10,
    });
    const top10 = diversified.slice(0, 10);
    const uaqCount = top10.filter((r) => r.domain.includes("uaq.mx")).length;
    assert.ok(uaqCount <= 2, `uaqCount=${uaqCount}`);
    assert.ok(top10.some((r) => r.domain.includes("ipn.mx")));
    assert.ok(top10.some((r) => r.domain.includes("gob.mx") || r.domain.includes("secihti")));
  });
});

describe("dedupe www/http", () => {
  it("unifica www y scheme", () => {
    assert.equal(
      urlDedupeKey("http://www.Example.com/a?utm_source=x#z"),
      urlDedupeKey("https://example.com/a"),
    );
    const { results, duplicateCount } = dedupeResults([
      fakeResult({ title: "A", url: "http://www.uaq.mx/a" }),
      fakeResult({ title: "B", url: "https://uaq.mx/a?utm_medium=y" }),
    ]);
    assert.equal(results.length, 1);
    assert.equal(duplicateCount, 1);
  });

  it("canonicalize no rompe path", () => {
    const u = canonicalizeUrl("https://Example.com/path/?id=1#frag");
    assert.equal(u, "https://example.com/path?id=1");
  });
});

describe("engine providerReports", () => {
  it("clasifica success / empty / rate_limited", async () => {
    const ok: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          fakeResult({
            title: "Wiki",
            url: "https://es.wikipedia.org/wiki/X",
            domain: "es.wikipedia.org",
            provider: "wikipedia",
          }),
        ];
      },
    };
    const empty: PaSearchProvider = {
      id: "arxiv",
      async search() {
        return [];
      },
    };
    const limited: PaSearchProvider = {
      id: "duckduckgo",
      async search() {
        throw new PaSearchError("rate_limited", "blocked", {
          provider: "duckduckgo",
        });
      },
    };
    const engine = createPaSearchEngine({
      providers: [ok, empty, limited],
      enableProviderSelection: false,
    });
    const res = await engine.search({ query: "test query words" });
    assert.equal(res.results.length, 1);
    assert.ok(res.providerReports.some((r) => r.status === "success"));
    assert.ok(res.providerReports.some((r) => r.status === "empty"));
    assert.ok(
      res.providerReports.some(
        (r) => r.provider === "duckduckgo" && r.status === "rate_limited",
      ),
    );
  });

  it("fan-out paralelo: un lento no bloquea al rápido (parcial)", async () => {
    const fast: PaSearchProvider = {
      id: "wikipedia",
      async search() {
        return [
          fakeResult({
            title: "Fast",
            url: "https://es.wikipedia.org/wiki/Fast",
            domain: "es.wikipedia.org",
            provider: "wikipedia",
          }),
        ];
      },
    };
    const slow: PaSearchProvider = {
      id: "mojeek",
      async search({ signal }) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 80);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new PaSearchError("timeout", "slow", { provider: "mojeek" }));
            },
            { once: true },
          );
        });
        return [];
      },
    };
    const engine = createPaSearchEngine({
      providers: [fast, slow],
      enableProviderSelection: false,
      providerConfigs: {
        mojeek: { timeoutMs: 30, maxResults: 5, enabled: true },
        wikipedia: { timeoutMs: 2000, maxResults: 5, enabled: true },
      },
      globalTimeoutMs: 500,
    });
    const started = Date.now();
    const res = await engine.search({ query: "parallel probe" });
    assert.ok(Date.now() - started < 400);
    assert.equal(res.results.length, 1);
    assert.ok(
      res.providerReports.some(
        (r) => r.provider === "mojeek" && r.status === "timeout",
      ),
    );
  });
});

describe("security: no secret leakage in reports", () => {
  it("providerReports no incluyen headers/cookies/tokens", async () => {
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
    });
    const res = await engine.search({ query: "hello" });
    const blob = JSON.stringify(res);
    for (const bad of [
      "Authorization",
      "api_key",
      "API_KEY",
      "cookie",
      "Cookie",
      "Bearer ",
      "bootstrap",
    ]) {
      assert.equal(blob.includes(bad), false, `found ${bad}`);
    }
  });
});
