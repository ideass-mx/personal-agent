/**
 * Tests PHASE 60.10 — ElectronSerpProvider (offline + optional live).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronDuckDuckGoSerpAdapter,
  createSerpDiscoveryProvider,
  ELECTRON_DDG_PROVIDER_ID,
  validateAndDedupeHits,
  classifyElectronSerpHealth,
  detectElectronBlock,
  interpretSerpExtract,
  pageExtractFromHtml,
  scrapeHitToDiscoveryResult,
  toSerpHit,
} from "../../src/research/electron-serp/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../src/research/electron-serp/fixtures");

describe("PHASE 60.10 ElectronSerpProvider unit", () => {
  it("provider contract id + source", () => {
    const a = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: { title: "", url: "", bodyText: "", links: [] },
      }),
    });
    assert.equal(a.id, ELECTRON_DDG_PROVIDER_ID);
    assert.equal(a.getSource().id, ELECTRON_DDG_PROVIDER_ID);
    assert.equal(a.getSource().enabled, true);
  });

  it("URL validation + dedupe + position", () => {
    const hits = [
      toSerpHit({
        title: "A",
        url: "https://example.com/a",
        provider: "t",
        position: 1,
      })!,
      toSerpHit({
        title: "B",
        url: "https://example.com/a",
        provider: "t",
        position: 2,
      })!,
      toSerpHit({
        title: "C",
        url: "https://example.com/c",
        provider: "t",
        position: 3,
      })!,
    ];
    const out = validateAndDedupeHits(hits, 10);
    assert.equal(out.length, 2);
    assert.equal(out[0]!.position, 1);
    assert.equal(out[1]!.position, 2);
    assert.equal(out[1]!.url, "https://example.com/c");
  });

  it("organic-result detection filters shell", () => {
    const html = readFileSync(join(fixtures, "ddg-v1.html"), "utf8");
    const extract = pageExtractFromHtml(html, "https://duckduckgo.com/?q=test");
    const out = interpretSerpExtract({ extract, limit: 10, html });
    assert.ok(out.hits.length >= 1);
    assert.ok(!out.hits.some((h) => /duckduckgo\.com/i.test(h.url)));
  });

  it("CAPTCHA → BLOCKED, no recovery", async () => {
    const html = readFileSync(join(fixtures, "ddg-captcha.html"), "utf8");
    const a = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: pageExtractFromHtml(html),
        html,
      }),
    });
    const out = await a.search({
      query: "x",
      limit: 5,
      htmlOverride: html,
    });
    assert.equal(out.blocked, true);
    assert.equal(out.health, "BLOCKED");
    assert.equal(out.hits.length, 0);
  });

  it("health classification", () => {
    assert.equal(
      classifyElectronSerpHealth({
        broken: false,
        challenge: false,
        hitCount: 6,
        unexpected: false,
      }),
      "HEALTHY",
    );
    assert.equal(
      classifyElectronSerpHealth({
        broken: false,
        challenge: false,
        hitCount: 2,
        unexpected: false,
      }),
      "DEGRADED",
    );
    assert.equal(
      classifyElectronSerpHealth({
        broken: false,
        challenge: true,
        hitCount: 0,
        unexpected: false,
      }),
      "BLOCKED",
    );
  });

  it("timeout / broken via searchFn", async () => {
    const a = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: { title: "", url: "", bodyText: "", links: [] },
        broken: true,
      }),
    });
    const out = await a.search({ query: "x", limit: 3 });
    assert.equal(out.health, "BROKEN");
    assert.equal(out.hits.length, 0);
  });

  it("unexpected / empty page → UNKNOWN or DEGRADED", () => {
    const out = interpretSerpExtract({
      extract: {
        title: "Something else",
        url: "https://example.com/",
        bodyText: "no results here",
        links: [],
      },
      limit: 5,
    });
    assert.ok(out.health === "UNKNOWN" || out.health === "DEGRADED");
  });

  it("normalization to SerpDiscoveryResult", () => {
    const html = readFileSync(join(fixtures, "ddg-v1.html"), "utf8");
    const out = interpretSerpExtract({
      extract: pageExtractFromHtml(html),
      limit: 5,
      html,
    });
    const disc = scrapeHitToDiscoveryResult(out.hits[0]!, ELECTRON_DDG_PROVIDER_ID);
    assert.ok(disc);
    assert.equal(disc!.providerId, ELECTRON_DDG_PROVIDER_ID);
  });

  it("session reuse queues searches serially", async () => {
    const order: number[] = [];
    let n = 0;
    const a = createElectronDuckDuckGoSerpAdapter({
      mode: "reusable",
      searchFn: async () => {
        const id = ++n;
        order.push(id);
        await new Promise((r) => setTimeout(r, 40));
        order.push(id + 10);
        return {
          extract: {
            title: "t",
            url: "https://duckduckgo.com/?q=x",
            bodyText: "organic",
            links: [{ href: "https://example.com/" + id, text: "Example " + id }],
          },
        };
      },
    });
    await a.warmUp();
    const [a1, a2] = await Promise.all([
      a.search({ query: "a", limit: 3 }),
      a.search({ query: "b", limit: 3 }),
    ]);
    assert.ok(a1.hits.length >= 1);
    assert.ok(a2.hits.length >= 1);
    assert.deepEqual(order, [1, 11, 2, 12]);
    await a.close();
  });

  it("one-shot lifecycle close is idempotent", async () => {
    const a = createElectronDuckDuckGoSerpAdapter({
      mode: "oneshot",
      searchFn: async () => ({
        extract: { title: "", url: "", bodyText: "", links: [] },
      }),
    });
    await a.close();
    await a.close();
  });

  it("detectElectronBlock on captcha html", () => {
    const html = readFileSync(join(fixtures, "ddg-captcha.html"), "utf8");
    assert.equal(detectElectronBlock(html).blocked, true);
  });

  it("no secrets in discovery payload", () => {
    const html = readFileSync(join(fixtures, "ddg-v1.html"), "utf8");
    const out = interpretSerpExtract({
      extract: pageExtractFromHtml(html),
      limit: 5,
      html,
    });
    const s = JSON.stringify(out);
    assert.ok(!/Set-Cookie|password|api_key/i.test(s));
  });
});

describe("PHASE 60.10 ElectronSerpProvider live (optional)", () => {
  it("live DuckDuckGo PostgreSQL 17 when ELECTRON_SERP_LIVE=1", async (t) => {
    if (process.env.ELECTRON_SERP_LIVE !== "1") {
      t.skip("set ELECTRON_SERP_LIVE=1");
      return;
    }
    const a = createElectronDuckDuckGoSerpAdapter({ mode: "reusable" });
    try {
      await a.warmUp();
      const out = await a.search({ query: "PostgreSQL 17", limit: 10 });
      assert.equal(out.blocked, false);
      assert.ok(out.hits.length >= 3);
      const disc = createSerpDiscoveryProvider({
        adapters: [a],
        sourceIds: [ELECTRON_DDG_PROVIDER_ID],
      });
      const res = await disc.discoverFrom(ELECTRON_DDG_PROVIDER_ID, {
        query: "PostgreSQL 17",
        limit: 8,
      });
      assert.ok(res.results.length >= 1);
    } finally {
      await a.close();
    }
  });
});
