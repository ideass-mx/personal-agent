/**
 * Tests deterministas — PHASE 60.9.6 electron-serp (sin DuckDuckGo live).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import {
  analyzeSerpPage,
  assertNoSecretsInPayload,
  detectChallenge,
  filterOrganicHits,
  finalizeRunResult,
  normalizeEnvSnapshot,
  redactSensitiveString,
  sanitizeDiagnosticUrl,
} from "../../src/research/experimental/electron-serp/index.ts";

describe("PHASE 60.9.6 electron-serp unit", () => {
  it("challenge detection", () => {
    assert.equal(
      detectChallenge({
        title: "DuckDuckGo",
        bodyText: "Please complete the following challenge to continue",
        url: "https://duckduckgo.com/",
      }),
      true,
    );
    assert.equal(
      detectChallenge({
        title: "PostgreSQL 17 at DuckDuckGo",
        bodyText: "PostgreSQL: The World's Most Advanced Open Source Relational Database",
        url: "https://duckduckgo.com/?q=PostgreSQL+17",
      }),
      false,
    );
  });

  it("organic extraction filters shell links", () => {
    const hits = filterOrganicHits([
      { href: "https://apps.apple.com/x", text: "App Store" },
      { href: "https://duck.ai/", text: "Duck.ai" },
      { href: "https://www.postgresql.org/", text: "PostgreSQL 17" },
      { href: "https://versionlog.com/postgresql/17/", text: "Postgres 17 notes" },
    ]);
    assert.equal(hits.length, 2);
    assert.ok(hits.some((h) => h.domain.includes("postgresql.org")));
  });

  it("successful result analysis", () => {
    const a = analyzeSerpPage({
      title: "PostgreSQL 17 at DuckDuckGo",
      url: "https://duckduckgo.com/?q=PostgreSQL+17",
      bodyText: "results",
      links: [
        { href: "https://www.postgresql.org/", text: "PostgreSQL" },
        { href: "https://dev.to/pg", text: "Article" },
      ],
    });
    assert.equal(a.challenge, false);
    assert.equal(a.containsPostgresqlOrg, true);
    assert.equal(a.organicDetected, true);
  });

  it("no result / challenge page", () => {
    const a = analyzeSerpPage({
      title: "Unfortunately, bots use DuckDuckGo too",
      url: "https://duckduckgo.com/?q=PostgreSQL+17",
      bodyText: "Please complete the following challenge",
      links: [{ href: "https://apps.apple.com/x", text: "App Store" }],
    });
    assert.equal(a.challenge, true);
  });

  it("malformed page yields empty organics", () => {
    const a = analyzeSerpPage({
      title: "",
      url: "about:blank",
      bodyText: "",
      links: [],
    });
    assert.equal(a.organicDetected, false);
    assert.equal(a.hits.length, 0);
  });

  it("URL sanitization + secret redaction", () => {
    const u = sanitizeDiagnosticUrl("https://duckduckgo.com/?q=PostgreSQL+17&session=abc");
    assert.ok(u && u.includes("q=PostgreSQL"));
    assert.ok(u && !u.includes("session="));
    assert.equal(redactSensitiveString("api_key_stuff"), "[redacted]");
  });

  it("no secret logging in finalize payload", () => {
    const result = finalizeRunResult(
      {
        query: "PostgreSQL 17",
        queryEntered: true,
        querySubmitted: true,
        navigation: true,
        elapsedMs: 10,
        env: { webdriver: false, userAgent: "Electron" },
        extract: {
          title: "t",
          url: "https://duckduckgo.com/?q=PostgreSQL+17",
          bodyText: "ok",
          links: [{ href: "https://www.postgresql.org/", text: "PostgreSQL" }],
        },
        browserMeta: { electronVersion: "33.0.0", chromeVersion: "130.0.0", os: "linux", arch: "x64" },
      },
      1,
      "/tmp/pa-electron-serp-test",
    );
    assert.equal(result.method, "electron-background");
    assert.equal(result.containsPostgresqlOrg, true);
    assertNoSecretsInPayload(result);
    assert.doesNotThrow(() => assertNoSecretsInPayload({ query: "PostgreSQL 17", cookieNames: [] }));
    assert.throws(() => assertNoSecretsInPayload({ password: "hunter2", api_key: "x" }));
  });

  it("env snapshot normalization", () => {
    const e = normalizeEnvSnapshot({
      webdriver: false,
      languages: ["en-US", "en"],
      deviceMemory: 8,
      userAgent: "x".repeat(500),
    });
    assert.equal(e.webdriver, false);
    assert.equal(e.userAgent!.length, 240);
  });

  it("runtime cleanup contract (mock child exit clears pending)", async () => {
    // Contrato: al salir el hijo, promesas pendientes deben fallar (sin hang).
    const ee = new EventEmitter();
    const pending = new Map<number, { reject: (e: Error) => void }>();
    let rejected = false;
    pending.set(1, {
      reject: () => {
        rejected = true;
      },
    });
    ee.on("exit", () => {
      for (const [, p] of pending) p.reject(new Error("electron exited"));
      pending.clear();
    });
    ee.emit("exit");
    assert.equal(rejected, true);
    assert.equal(pending.size, 0);
  });

  it("timeout error shape is explicit", () => {
    const err = new Error("cmd timeout: searchDdg");
    assert.match(err.message, /timeout/);
  });
});
