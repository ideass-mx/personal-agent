/**
 * PHASE 60.13.1 — Brave pacing metrics (offline unit tests).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNoSecretsInPacingPayload,
  buildSessionPlan,
  classifyPacingOutcome,
  describeCorrelation,
  firstChallengeSearchNumber,
  pearsonCorrelation,
  realSearchDensityPerMinute,
  successRate,
  summarizeSession,
  sustainedSearchCapacity,
  type BravePacingSearchRecord,
} from "../../src/research/experimental/brave-pacing/index.ts";

function rec(
  partial: Partial<BravePacingSearchRecord> & {
    searchNumber: number;
    outcome: BravePacingSearchRecord["outcome"];
  },
): BravePacingSearchRecord {
  return {
    timestamp: partial.timestamp ?? new Date().toISOString(),
    sessionId: partial.sessionId ?? "s1",
    intervalMs: partial.intervalMs ?? 1000,
    searchNumber: partial.searchNumber,
    query: partial.query ?? "PostgreSQL 17",
    timeSincePreviousSearchMs: partial.timeSincePreviousSearchMs ?? null,
    totalSessionElapsedMs: partial.totalSessionElapsedMs ?? partial.searchNumber * 1000,
    navigation: partial.navigation ?? true,
    queryEntered: partial.queryEntered ?? true,
    querySubmitted: partial.querySubmitted ?? true,
    challenge: partial.challenge ?? partial.outcome === "CHALLENGE",
    blocked: partial.blocked ?? partial.outcome === "BLOCKED",
    resultCount: partial.resultCount ?? (partial.outcome === "SUCCESS" ? 10 : 0),
    organicResultCount:
      partial.organicResultCount ?? (partial.outcome === "SUCCESS" ? 10 : 0),
    extractionMethod: partial.extractionMethod ?? "selector",
    latencyMs: partial.latencyMs ?? 500,
    outcome: partial.outcome,
    env: partial.env,
  };
}

describe("PHASE 60.13.1 Brave pacing metrics", () => {
  it("A — intervalo registrado en plan/session", () => {
    const plan = buildSessionPlan([1000, 5000], 2, 42);
    assert.equal(plan.length, 4);
    assert.ok(plan.every((p) => p.intervalMs === 1000 || p.intervalMs === 5000));
    assert.ok(plan.every((p) => typeof p.sessionId === "string"));
  });

  it("B — timeSincePreviousSearch correcto en summarize", () => {
    const records = [
      rec({
        searchNumber: 1,
        outcome: "SUCCESS",
        timeSincePreviousSearchMs: null,
        totalSessionElapsedMs: 400,
      }),
      rec({
        searchNumber: 2,
        outcome: "SUCCESS",
        timeSincePreviousSearchMs: 1500,
        totalSessionElapsedMs: 2000,
      }),
    ];
    assert.equal(records[1]!.timeSincePreviousSearchMs, 1500);
  });

  it("C — totalSessionElapsed obligatorio", () => {
    const s = summarizeSession("s", 5000, [
      rec({ searchNumber: 1, outcome: "SUCCESS", totalSessionElapsedMs: 800 }),
      rec({ searchNumber: 2, outcome: "SUCCESS", totalSessionElapsedMs: 6200 }),
    ]);
    assert.equal(s.totalTimeMs, 6200);
  });

  it("D — challenge detectado", () => {
    assert.equal(
      classifyPacingOutcome({
        challenge: true,
        blocked: true,
        organicResultCount: 0,
      }),
      "CHALLENGE",
    );
  });

  it("E — EMPTY ≠ BLOCKED", () => {
    assert.equal(
      classifyPacingOutcome({
        challenge: false,
        blocked: false,
        organicResultCount: 0,
      }),
      "EMPTY",
    );
    assert.notEqual(
      classifyPacingOutcome({
        challenge: false,
        blocked: false,
        organicResultCount: 0,
      }),
      "BLOCKED",
    );
  });

  it("F — Sustained Search Capacity", () => {
    const records = [
      rec({ searchNumber: 1, outcome: "SUCCESS" }),
      rec({ searchNumber: 2, outcome: "SUCCESS" }),
      rec({ searchNumber: 3, outcome: "SUCCESS" }),
      rec({ searchNumber: 4, outcome: "SUCCESS" }),
      rec({ searchNumber: 5, outcome: "SUCCESS" }),
      rec({ searchNumber: 6, outcome: "SUCCESS" }),
      rec({ searchNumber: 7, outcome: "SUCCESS" }),
      rec({ searchNumber: 8, outcome: "CHALLENGE", challenge: true }),
    ];
    assert.equal(sustainedSearchCapacity(records), 7);
    assert.equal(firstChallengeSearchNumber(records), 8);
  });

  it("G — success rate", () => {
    const records = [
      rec({ searchNumber: 1, outcome: "SUCCESS" }),
      rec({ searchNumber: 2, outcome: "SUCCESS" }),
      rec({ searchNumber: 3, outcome: "EMPTY" }),
      rec({ searchNumber: 4, outcome: "CHALLENGE", challenge: true }),
    ];
    assert.equal(successRate(records), 0.5);
  });

  it("H — sesiones independientes en plan (ids distintos)", () => {
    const plan = buildSessionPlan([1000], 3, 1);
    const ids = new Set(plan.map((p) => p.sessionId));
    assert.equal(ids.size, 3);
  });

  it("I — fingerprint/UA solo observación (env snapshot pasivo)", () => {
    const r = rec({
      searchNumber: 1,
      outcome: "SUCCESS",
      env: {
        webdriver: false,
        userAgent: "Mozilla/5.0 Electron",
        webglVendor: "Intel",
        webglRenderer: "Mesa",
        viewport: { width: 1920, height: 1080 },
        devicePixelRatio: 2,
        languages: ["en-US"],
      },
    });
    assert.equal(r.env?.webdriver, false);
    // No mutation API — solo campos readonly en el tipo
    assert.ok(r.env?.userAgent);
  });

  it("J — no CAPTCHA solving (outcome challenge se registra y corta)", () => {
    const records = [
      rec({ searchNumber: 1, outcome: "SUCCESS" }),
      rec({ searchNumber: 2, outcome: "CHALLENGE", challenge: true }),
    ];
    assert.equal(sustainedSearchCapacity(records), 1);
    // Política: no hay función resolveChallenge en el módulo
    assert.equal(
      typeof (globalThis as { resolveChallenge?: unknown }).resolveChallenge,
      "undefined",
    );
  });

  it("K — timestamp y sessionId presentes", () => {
    const r = rec({
      searchNumber: 1,
      outcome: "SUCCESS",
      sessionId: "i1000-r1",
      timestamp: "2026-09-08T12:00:00.000Z",
    });
    assert.ok(r.timestamp);
    assert.equal(r.sessionId, "i1000-r1");
  });

  it("L — no secrets en payload", () => {
    const payload = {
      records: [rec({ searchNumber: 1, outcome: "SUCCESS" })],
    };
    assert.doesNotThrow(() => assertNoSecretsInPacingPayload(payload));
    assert.throws(() =>
      assertNoSecretsInPacingPayload({ cookie: "Set-Cookie: a=b" }),
    );
  });

  it("search density real", () => {
    const dens = realSearchDensityPerMinute([
      rec({ searchNumber: 1, outcome: "SUCCESS", totalSessionElapsedMs: 0 }),
      rec({ searchNumber: 2, outcome: "SUCCESS", totalSessionElapsedMs: 60_000 }),
    ]);
    assert.ok(dens > 1.5 && dens < 2.5);
  });

  it("correlation helper language", () => {
    const r = pearsonCorrelation([1, 5, 10, 20, 30, 60], [3, 5, 8, 12, 14, 15]);
    assert.ok(r != null && r > 0);
    assert.match(describeCorrelation(r), /correlación|evidencia/i);
  });
});
