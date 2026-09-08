/**
 * Tests deterministas — parsers y métricas browser-ab (no live).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blockRate,
  classifyBlockReason,
  coverage,
  emptyRate,
  parseDuckDuckGoHtmlResults,
  parseGenericSerpLinks,
  parseMojeekHtmlResults,
  topUrlOverlap,
  urlJaccard,
} from "../../src/research/experimental/browser-ab/index.ts";
import type { Observation } from "../../src/research/experimental/browser-ab/types.ts";

describe("PHASE 60.9.2 browser-ab unit", () => {
  it("BrowserResultParser / DDG HTML", () => {
    const html = `
      <a class="result__a" href="https://example.com/a">Alpha Title</a>
      <a class="result__a" href="https://example.com/b">Beta Title</a>
    `;
    const hits = parseDuckDuckGoHtmlResults(html);
    assert.equal(hits.length, 2);
    assert.equal(hits[0]?.domain, "example.com");
  });

  it("Mojeek HTML parser", () => {
    const html = `<a class="ob" href="https://docs.example.com/x">Docs Title Here</a>`;
    const hits = parseMojeekHtmlResults(html);
    assert.equal(hits.length, 1);
    assert.match(hits[0]!.url, /^https:/);
  });

  it("generic serp links exclude hosts", () => {
    const hits = parseGenericSerpLinks(
      [
        { href: "https://duckduckgo.com/x", text: "nav" },
        { href: "https://react.dev/", text: "React Documentation Site" },
      ],
      ["duckduckgo.com"],
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.domain, "react.dev");
  });

  it("BenchmarkMetrics coverage/block/empty", () => {
    const rows: Observation[] = [
      {
        run: 1,
        queryId: "a",
        query: "a",
        provider: "duckduckgo",
        method: "http",
        status: "success",
        latencyMs: 10,
        resultCount: 3,
        blocked: false,
        blockReason: null,
        results: [],
      },
      {
        run: 1,
        queryId: "b",
        query: "b",
        provider: "duckduckgo",
        method: "http",
        status: "blocked",
        latencyMs: 10,
        resultCount: 0,
        blocked: true,
        blockReason: "captcha_or_challenge",
        results: [],
      },
      {
        run: 1,
        queryId: "c",
        query: "c",
        provider: "duckduckgo",
        method: "http",
        status: "empty",
        latencyMs: 10,
        resultCount: 0,
        blocked: false,
        blockReason: null,
        results: [],
      },
    ];
    assert.equal(coverage(rows), 1 / 3);
    assert.equal(blockRate(rows), 1 / 3);
    assert.equal(emptyRate(rows), 1 / 3);
  });

  it("URL overlap", () => {
    assert.equal(urlJaccard(["https://a.com/"], ["https://a.com"]), 1);
    assert.equal(
      topUrlOverlap(
        [{ url: "https://a.com" }, { url: "https://b.com" }],
        [{ url: "https://a.com" }, { url: "https://c.com" }],
        5,
      ),
      0.333,
    );
  });

  it("block classification", () => {
    assert.equal(classifyBlockReason({ status: 403 }), "http_403");
    assert.equal(classifyBlockReason({ status: 202 }), "http_202");
    assert.equal(
      classifyBlockReason({ bodySnippet: "please complete captcha" }),
      "captcha_or_challenge",
    );
  });
});
