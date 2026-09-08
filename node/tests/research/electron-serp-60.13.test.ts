/**
 * PHASE 60.13 — Electron Brave Search Web SERP (offline + optional live).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronBraveSerpAdapter,
  createElectronDuckDuckGoSerpAdapter,
  createSerpDiscoveryProvider,
  ELECTRON_BRAVE_PROVIDER_ID,
  ELECTRON_DDG_PROVIDER_ID,
  interpretBraveSerpExtract,
  pageExtractFromBraveHtml,
  detectBraveBlock,
  scrapeHitToDiscoveryResult,
} from "../../src/research/electron-serp/index.ts";
import { createResearchEngine } from "../../src/research/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../src/research/electron-serp/fixtures");

describe("PHASE 60.13 Electron Brave SERP", () => {
  it("A — adapter creation", () => {
    const a = createElectronBraveSerpAdapter({
      searchFn: async () => ({
        extract: { title: "", url: "", bodyText: "", links: [] },
      }),
    });
    assert.equal(a.id, ELECTRON_BRAVE_PROVIDER_ID);
    assert.equal(a.getSource().id, ELECTRON_BRAVE_PROVIDER_ID);
    assert.equal(a.getSource().enabled, true);
  });

  it("B — URL buildRequest apunta a Brave Search Web", () => {
    const a = createElectronBraveSerpAdapter({
      searchFn: async () => ({
        extract: { title: "", url: "", bodyText: "", links: [] },
      }),
    });
    const req = a.buildRequest({ query: "PostgreSQL 17", limit: 5 });
    assert.match(req.url, /^https:\/\/search\.brave\.com\/search\?/);
    assert.match(req.url, /q=PostgreSQL/);
    assert.ok(!/api\.search\.brave|x-subscription-token/i.test(req.url));
  });

  it("C — fixture HTML produce resultados", async () => {
    const html = readFileSync(join(fixtures, "brave-v1.html"), "utf8");
    const a = createElectronBraveSerpAdapter({
      searchFn: async () => ({
        extract: pageExtractFromBraveHtml(html),
        html,
      }),
    });
    const out = await a.search({
      query: "PostgreSQL 17",
      limit: 10,
      htmlOverride: html,
    });
    assert.equal(out.blocked, false);
    assert.ok(out.hits.length >= 3);
    assert.ok(out.hits.some((h) => /postgresql\.org/i.test(h.url)));
    const disc = scrapeHitToDiscoveryResult(
      out.hits[0]!,
      ELECTRON_BRAVE_PROVIDER_ID,
    );
    assert.ok(disc);
    assert.equal(typeof disc!.title, "string");
    assert.equal(typeof disc!.url, "string");
    assert.equal(typeof disc!.domain, "string");
  });

  it("D — empty HTML → empty / no hits", async () => {
    const html = readFileSync(join(fixtures, "brave-empty.html"), "utf8");
    const out = await createElectronBraveSerpAdapter({
      searchFn: async () => ({
        extract: pageExtractFromBraveHtml(html),
        html,
      }),
    }).search({ query: "zzz", limit: 5, htmlOverride: html });
    assert.equal(out.hits.length, 0);
    assert.equal(out.blocked, false);
  });

  it("E — challenge fixture → blocked", async () => {
    const html = readFileSync(join(fixtures, "brave-captcha.html"), "utf8");
    assert.equal(detectBraveBlock(html).blocked, true);
    const out = await createElectronBraveSerpAdapter({
      searchFn: async () => ({
        extract: pageExtractFromBraveHtml(html),
        html,
      }),
    }).search({ query: "x", limit: 5, htmlOverride: html });
    assert.equal(out.blocked, true);
    assert.equal(out.health, "BLOCKED");
    assert.equal(out.hits.length, 0);
  });

  it("F — normalization contract", () => {
    const html = readFileSync(join(fixtures, "brave-v1.html"), "utf8");
    const outcome = interpretBraveSerpExtract({
      extract: pageExtractFromBraveHtml(html),
      limit: 5,
      html,
    });
    for (const h of outcome.hits) {
      assert.ok(h.title.length >= 1);
      assert.match(h.url, /^https?:\/\//);
      assert.equal(h.provider, ELECTRON_BRAVE_PROVIDER_ID);
      assert.ok(typeof h.position === "number");
      assert.ok(typeof h.confidence === "number");
    }
  });

  it("G — runtime reuse (warmUp once)", async () => {
    let warmUps = 0;
    const adapter = createElectronBraveSerpAdapter({
      mode: "reusable",
      searchFn: async (q) => ({
        extract: {
          title: "t",
          url: "https://search.brave.com/search?q=" + q,
          bodyText: "ok",
          links: [
            { href: "https://example.com/" + q, text: "Result page for " + q },
          ],
        },
      }),
    });
    const orig = adapter.warmUp.bind(adapter);
    adapter.warmUp = async () => {
      warmUps += 1;
      return orig();
    };
    await adapter.warmUp();
    await adapter.search({ query: "A", limit: 3 });
    await adapter.search({ query: "B", limit: 3 });
    assert.equal(warmUps, 1);
    await adapter.close();
  });

  it("H — cleanup close", async () => {
    const adapter = createElectronBraveSerpAdapter({
      mode: "reusable",
      searchFn: async () => ({
        extract: {
          title: "t",
          url: "https://search.brave.com/search?q=x",
          bodyText: "ok",
          links: [{ href: "https://example.com/", text: "Example result" }],
        },
      }),
    });
    await adapter.search({ query: "x" });
    await adapter.close();
    assert.equal(adapter.pendingCount(), 0);
  });

  it("I — no secrets in payload", async () => {
    const html = readFileSync(join(fixtures, "brave-v1.html"), "utf8");
    const out = await createElectronBraveSerpAdapter({
      searchFn: async () => ({
        extract: pageExtractFromBraveHtml(html),
        html,
      }),
    }).search({ query: "PostgreSQL 17", htmlOverride: html });
    const s = JSON.stringify(out);
    assert.ok(!/api[_-]?key/i.test(s));
    assert.ok(!/subscription.?token/i.test(s));
    assert.ok(!/Set-Cookie/i.test(s));
    assert.ok(!/password/i.test(s));
  });

  it("J — production invariant: DDG engine default unchanged", async () => {
    const engine = createResearchEngine({
      search: async (req) => ({
        query: req.query,
        provider: "electron-duckduckgo",
        retrievedAt: new Date().toISOString(),
        results: [
          { title: "t", url: "https://example.com/", domain: "example.com" },
        ],
      }),
    });
    const res = await engine.search({ query: "test" });
    assert.equal(res.provider, "electron-duckduckgo");
    const ddg = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "t",
          url: "https://duckduckgo.com/?q=x",
          bodyText: "ok",
          links: [
            {
              href: "https://www.postgresql.org/",
              text: "PostgreSQL Official",
            },
          ],
        },
      }),
    });
    assert.equal(ddg.id, ELECTRON_DDG_PROVIDER_ID);
    const disc = createSerpDiscoveryProvider({
      adapters: [ddg],
      sourceIds: [ELECTRON_DDG_PROVIDER_ID],
    });
    const out = await disc.discoverFrom(ELECTRON_DDG_PROVIDER_ID, {
      query: "PostgreSQL 17",
      limit: 5,
    });
    assert.ok(out.results.length >= 1);
  });

  it("live Brave smoke when ELECTRON_BRAVE_LIVE=1", async (t) => {
    if (process.env.ELECTRON_BRAVE_LIVE !== "1") {
      t.skip("set ELECTRON_BRAVE_LIVE=1");
      return;
    }
    const adapter = createElectronBraveSerpAdapter({ mode: "reusable" });
    try {
      await adapter.warmUp();
      const out = await adapter.search({ query: "PostgreSQL 17", limit: 8 });
      assert.equal(out.blocked, false);
      assert.ok(out.hits.length >= 1);
    } finally {
      await adapter.close();
    }
  });
});
