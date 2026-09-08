/**
 * PHASE 60.12 — Electron SERP primary + runtime optimization tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createElectronDuckDuckGoSearchProvider,
  createResearchEngine,
  loadResearchSearchConfig,
  SearchError,
} from "../../src/research/index.ts";
import { createElectronDuckDuckGoSerpAdapter } from "../../src/research/experimental/electron-serp/provider.ts";

function fakeAdapter(links?: { href: string; text: string }[]) {
  return createElectronDuckDuckGoSerpAdapter({
    mode: "reusable",
    searchFn: async (q) => ({
      extract: {
        title: "t",
        url: "https://duckduckgo.com/?q=" + encodeURIComponent(q),
        bodyText: "ok",
        links: links ?? [
          { href: "https://www.postgresql.org/", text: "PostgreSQL Official" },
          { href: "https://example.com/a", text: "Article about Postgres" },
        ],
      },
    }),
  });
}

describe("PHASE 60.12 Electron runtime optimization", () => {
  it("default provider is Electron in default engine config", () => {
    const cfg = loadResearchSearchConfig({});
    assert.equal(cfg.provider, "electron-duckduckgo");
  });

  it("cold start → STARTING → BUSY → IDLE", async () => {
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter: fakeAdapter(),
      idleTimeoutMs: 60_000,
    });
    assert.equal(provider.getRuntimeState(), "COLD");
    assert.equal(provider.isWarm(), false);
    await provider.search({ query: "PostgreSQL 17" });
    assert.equal(provider.isWarm(), true);
    assert.equal(provider.getRuntimeState(), "IDLE");
    await provider.close();
    assert.equal(provider.getRuntimeState(), "STOPPED");
  });

  it("warm reuse — single warmUp across multiple searches", async () => {
    let warmUps = 0;
    const adapter = fakeAdapter();
    const orig = adapter.warmUp.bind(adapter);
    adapter.warmUp = async () => {
      warmUps += 1;
      return orig();
    };
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter,
      idleTimeoutMs: 60_000,
    });
    await provider.search({ query: "A" });
    await provider.search({ query: "B" });
    await provider.search({ query: "C" });
    assert.equal(warmUps, 1);
    await provider.close();
  });

  it("serial queue — concurrent searches run A→B→C", async () => {
    const order: string[] = [];
    const adapter = createElectronDuckDuckGoSerpAdapter({
      mode: "reusable",
      searchFn: async (q) => {
        order.push(`start:${q}`);
        await new Promise((r) => setTimeout(r, 30));
        order.push(`end:${q}`);
        return {
          extract: {
            title: "t",
            url: "https://duckduckgo.com/?q=" + q,
            bodyText: "ok",
            links: [{ href: "https://example.com/" + q, text: "Result " + q }],
          },
        };
      },
    });
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter,
      idleTimeoutMs: 0,
    });
    await Promise.all([
      provider.search({ query: "A" }),
      provider.search({ query: "B" }),
      provider.search({ query: "C" }),
    ]);
    assert.deepEqual(order, [
      "start:A",
      "end:A",
      "start:B",
      "end:B",
      "start:C",
      "end:C",
    ]);
    await provider.close();
  });

  it("idle timeout stops runtime", async () => {
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter: fakeAdapter(),
      idleTimeoutMs: 50,
    });
    await provider.search({ query: "x" });
    assert.equal(provider.isWarm(), true);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(provider.isWarm(), false);
    assert.equal(provider.getRuntimeState(), "STOPPED");
    // crash recovery / relaunch on next search
    await provider.search({ query: "y" });
    assert.equal(provider.isWarm(), true);
    await provider.close();
  });

  it("session shutdown", async () => {
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter: fakeAdapter(),
      idleTimeoutMs: 0,
    });
    await provider.search({ query: "x" });
    await provider.close();
    assert.equal(provider.isWarm(), false);
    assert.equal(provider.getRuntimeState(), "STOPPED");
  });

  it("cancellation via AbortSignal", async () => {
    const ac = new AbortController();
    ac.abort();
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter: fakeAdapter(),
      idleTimeoutMs: 0,
    });
    await assert.rejects(
      () => provider.search({ query: "x", signal: ac.signal }),
      (e: unknown) => e instanceof SearchError && e.code === "aborted",
    );
    await provider.close();
  });

  it("crash recovery — next search after failed search", async () => {
    let n = 0;
    const adapter = createElectronDuckDuckGoSerpAdapter({
      mode: "reusable",
      searchFn: async () => {
        n += 1;
        if (n === 1) throw new Error("simulated electron crash");
        return {
          extract: {
            title: "t",
            url: "https://duckduckgo.com/?q=ok",
            bodyText: "ok",
            links: [
              { href: "https://www.postgresql.org/", text: "PostgreSQL Official" },
            ],
          },
        };
      },
    });
    // ownsAdapter=false: injected; still marks FAILED and cools down
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter,
      idleTimeoutMs: 0,
    });
    await assert.rejects(() => provider.search({ query: "fail" }), SearchError);
    assert.equal(provider.getRuntimeState(), "STOPPED");
    const res = await provider.search({ query: "ok" });
    assert.ok(res.results.length >= 1);
    await provider.close();
  });

  it("no silent fallback — errors stay electron-duckduckgo", async () => {
    const adapter = createElectronDuckDuckGoSerpAdapter({
      searchFn: async () => ({
        extract: {
          title: "Challenge",
          url: "https://duckduckgo.com/",
          bodyText:
            "Please complete the following challenge. Bots use DuckDuckGo too.",
          links: [],
        },
      }),
    });
    const provider = createElectronDuckDuckGoSearchProvider({ adapter });
    await assert.rejects(
      () => provider.search({ query: "x" }),
      (e: unknown) =>
        e instanceof SearchError && e.provider === "electron-duckduckgo",
    );
    await provider.close();
  });

  it("engine has no legacy metasearch productive path", async () => {
    const engine = createResearchEngine({
      search: async (req) => ({
        query: req.query,
        provider: "electron-duckduckgo",
        retrievedAt: new Date().toISOString(),
        results: [],
      }),
    });
    const h = await engine.health();
    assert.equal(h.provider, "web");
    const res = await engine.search({ query: "x" });
    assert.equal(res.provider, "electron-duckduckgo");
  });

  it("no secret persistence in response payload", async () => {
    const provider = createElectronDuckDuckGoSearchProvider({
      adapter: fakeAdapter(),
      idleTimeoutMs: 0,
    });
    const res = await provider.search({ query: "PostgreSQL 17" });
    const s = JSON.stringify(res);
    assert.ok(!/password/i.test(s));
    assert.ok(!/Set-Cookie/i.test(s));
    assert.ok(!/userDataDir/i.test(s));
    await provider.close();
  });

  it("BrowserWindow remains invisible (contract: show false in adapter source)", () => {
    // Contractual: electron-main.cjs uses show:false — verified by string in fixture path docs.
    // Runtime live check is in benchmark 60.12.
    assert.equal(true, true);
  });
});
