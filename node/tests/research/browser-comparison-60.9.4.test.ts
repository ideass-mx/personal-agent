/**
 * Tests deterministas — 60.9.4 browser comparison helpers.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSummary,
  detectChallenge,
  filterOrganicHits,
  normalizeObservation,
  organicResultsDetected,
  sanitizeUrl,
} from "../../src/research/experimental/browser-comparison/index.ts";

describe("PHASE 60.9.4 browser-comparison unit", () => {
  it("URL sanitization drops sensitive params", () => {
    const u = sanitizeUrl(
      "https://duckduckgo.com/?q=PostgreSQL+17&session=abc&token=xyz",
    );
    assert.ok(u);
    assert.match(u!, /q=PostgreSQL/);
    assert.doesNotMatch(u!, /session=/);
    assert.doesNotMatch(u!, /token=/);
  });

  it("secret redaction on sensitive path", () => {
    const u = sanitizeUrl("https://example.com/credential/leak");
    assert.equal(u, "https://example.com/[redacted]");
  });

  it("challenge detection", () => {
    assert.equal(
      detectChallenge({
        bodyText: "Unfortunately, bots use DuckDuckGo too. Please complete the following challenge",
      }),
      true,
    );
    assert.equal(
      detectChallenge({
        title: "PostgreSQL 17 at DuckDuckGo",
        bodyText: "PostgreSQL 17 Released! postgresql.org",
        url: "https://duckduckgo.com/?q=PostgreSQL+17",
      }),
      false,
    );
  });

  it("organic result detection filters shell links", () => {
    const hits = filterOrganicHits([
      { href: "https://apps.apple.com/app/x", text: "iOS Browser" },
      { href: "https://duck.ai/", text: "Duck.ai" },
      { href: "https://www.postgresql.org/about/news/postgresql-17-released-2936/", text: "PostgreSQL 17 Released!" },
      { href: "https://www.postgresql.org/download/", text: "PostgreSQL: Downloads" },
    ]);
    assert.equal(hits.length, 2);
    assert.ok(organicResultsDetected(hits));
    assert.ok(hits.every((h) => h.domain.includes("postgresql.org")));
  });

  it("normalize observation strips cookie values shape", () => {
    const n = normalizeObservation({
      method: "manual",
      run: 1,
      query: "PostgreSQL 17",
      queryEntered: true,
      querySubmitted: true,
      finalUrl: "https://duckduckgo.com/?q=PostgreSQL+17&api_key=secret",
      navigationCount: 2,
      redirectChain: [],
      httpStatus: 200,
      challengeDetected: false,
      organicResultsDetected: true,
      resultCount: 8,
      pageTitle: "PostgreSQL 17 at DuckDuckGo",
      resourceCount: 40,
      cookieNames: ["kl", "ay"],
      elapsedMs: 3000,
    });
    assert.equal(n.cookieNames.length, 2);
    assert.ok(n.finalUrl && !n.finalUrl.includes("api_key"));
  });

  it("summary calculation CASE B", () => {
    const rows = [
      normalizeObservation({
        method: "manual",
        run: 1,
        queryEntered: true,
        querySubmitted: true,
        navigationCount: 1,
        challengeDetected: false,
        organicResultsDetected: true,
        resultCount: 8,
        resourceCount: 50,
        elapsedMs: 3000,
        cookieNames: [],
        redirectChain: [],
      }),
      normalizeObservation({
        method: "manual",
        run: 2,
        queryEntered: true,
        querySubmitted: true,
        navigationCount: 1,
        challengeDetected: false,
        organicResultsDetected: true,
        resultCount: 9,
        resourceCount: 55,
        elapsedMs: 3200,
        cookieNames: [],
        redirectChain: [],
      }),
      normalizeObservation({
        method: "manual",
        run: 3,
        queryEntered: true,
        querySubmitted: true,
        navigationCount: 1,
        challengeDetected: false,
        organicResultsDetected: true,
        resultCount: 7,
        resourceCount: 48,
        elapsedMs: 2800,
        cookieNames: [],
        redirectChain: [],
      }),
      normalizeObservation({
        method: "playwright",
        run: 1,
        queryEntered: true,
        querySubmitted: true,
        navigationCount: 2,
        challengeDetected: true,
        organicResultsDetected: false,
        resultCount: 0,
        resourceCount: 150,
        elapsedMs: 4000,
        cookieNames: [],
        redirectChain: [],
      }),
      normalizeObservation({
        method: "playwright",
        run: 2,
        queryEntered: true,
        querySubmitted: true,
        navigationCount: 2,
        challengeDetected: true,
        organicResultsDetected: false,
        resultCount: 0,
        resourceCount: 156,
        elapsedMs: 4100,
        cookieNames: [],
        redirectChain: [],
      }),
      normalizeObservation({
        method: "playwright",
        run: 3,
        queryEntered: true,
        querySubmitted: true,
        navigationCount: 2,
        challengeDetected: true,
        organicResultsDetected: false,
        resultCount: 0,
        resourceCount: 160,
        elapsedMs: 4200,
        cookieNames: [],
        redirectChain: [],
      }),
    ];
    const s = computeSummary(rows);
    assert.equal(s.caseId, "B");
    assert.equal(s.manualSuccessRate, 1);
    assert.equal(s.playwrightChallengeRate, 1);
    assert.equal(s.playwrightOrganicResultRate, 0);
  });
});
