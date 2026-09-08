/**
 * Tests deterministas — PHASE 60.9.5 browser divergence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDivergence,
  compareSnapshots,
  compareValue,
  firstDivergencePoint,
  normalizeEnvSnapshot,
  normalizeNetworkEvent,
  redactSensitiveString,
  sanitizeUrl,
} from "../../src/research/experimental/browser-divergence/index.ts";

describe("PHASE 60.9.5 browser-divergence unit", () => {
  it("snapshot normalization", () => {
    const s = normalizeEnvSnapshot({
      userAgent: "Mozilla/5.0",
      webdriver: true,
      languages: ["en-US", "en"],
      cookieNames: ["kl"],
      permissions: { notifications: "prompt" },
      url: "https://duckduckgo.com/?q=PostgreSQL+17&token=abc",
    });
    assert.equal(s.webdriver, true);
    assert.equal(s.cookieNames[0], "kl");
    assert.ok(s.url && !s.url.includes("token="));
  });

  it("secret redaction", () => {
    assert.equal(redactSensitiveString("my_api_key_value"), "[redacted]");
    assert.equal(redactSensitiveString("postgresql"), "postgresql");
  });

  it("URL sanitization", () => {
    const u = sanitizeUrl("https://duckduckgo.com/?q=PostgreSQL+17&session=x");
    assert.ok(u && u.includes("q=PostgreSQL"));
    assert.ok(u && !u.includes("session="));
  });

  it("network event normalization", () => {
    const e = normalizeNetworkEvent({
      kind: "request",
      url: "https://duckduckgo.com/dist/foo.js?token=1",
      resourceType: "script",
      status: null,
      timingMs: 12,
    });
    assert.ok(e);
    assert.equal(e!.hostname, "duckduckgo.com");
    assert.equal(e!.resourceType, "script");
  });

  it("comparison SAME/DIFFERENT", () => {
    assert.equal(compareValue(true, true), "SAME");
    assert.equal(compareValue(true, false), "DIFFERENT");
    assert.equal(compareValue(null, false), "UNKNOWN");
  });

  it("compareSnapshots flags webdriver", () => {
    const a = normalizeEnvSnapshot({ webdriver: false, language: "en-US", timezone: "UTC" });
    const b = normalizeEnvSnapshot({ webdriver: true, language: "en-US", timezone: "UTC" });
    const rows = compareSnapshots(a, b);
    const wd = rows.find((r) => r.field === "webdriver");
    assert.equal(wd?.difference, "DIFFERENT");
    assert.equal(wd?.potentialRelevance, "possible");
  });

  it("first divergence + classification", () => {
    const a = normalizeEnvSnapshot({ webdriver: false });
    const b = normalizeEnvSnapshot({ webdriver: true });
    const t0 = compareSnapshots(a, b);
    const point = firstDivergencePoint({ t0, t1: [], t2: [] });
    assert.equal(point, "T0");
    const c = classifyDivergence({
      firstPoint: point,
      t0Diffs: t0,
      possibleRelevantDiffs: t0.filter((x) => x.potentialRelevance === "possible"),
    });
    assert.equal(c.caseId, "A");
    assert.equal(c.causeIdentified, false);
  });
});
