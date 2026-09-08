/**
 * PHASE 60.15.1 — chip labels + normalize (sin React).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSafeHttpUrl,
  normalizeAgentSources,
  sourcesChipLabel,
  sourcesPanelTitle,
} from "../src/sources/types.ts";

describe("PHASE 60.15.1 sources UX helpers", () => {
  it("A — sin fuentes → label vacío", () => {
    assert.equal(sourcesChipLabel(0), "");
    assert.equal(sourcesChipLabel(-1), "");
  });

  it("B — una fuente singular", () => {
    assert.equal(sourcesChipLabel(1), "1 fuente");
    assert.equal(sourcesPanelTitle(1), "1 fuente");
  });

  it("C — múltiples fuentes plural", () => {
    assert.equal(sourcesChipLabel(8), "8 fuentes");
    assert.equal(sourcesPanelTitle(8), "8 fuentes");
  });

  it("G/H — normalize filtra URLs inseguras y acepta sin snippet", () => {
    const out = normalizeAgentSources([
      {
        id: "source-1",
        title: "PostgreSQL 17",
        url: "https://www.postgresql.org/",
        domain: "www.postgresql.org",
        sourceType: "official",
      },
      {
        id: "bad",
        title: "x",
        url: "javascript:alert(1)",
        domain: "x",
      },
      {
        id: "source-2",
        title: "Wiki",
        url: "https://en.wikipedia.org/wiki/PostgreSQL",
        domain: "en.wikipedia.org",
        snippet: "RDBMS",
        sourceType: "knowledge",
      },
    ]);
    assert.equal(out?.length, 2);
    assert.equal(out?.[0]?.sourceType, "official");
    assert.equal(out?.[0]?.snippet, undefined);
    assert.equal(out?.[1]?.snippet, "RDBMS");
  });

  it("I — source types válidos", () => {
    for (const sourceType of ["web", "academic", "knowledge", "official"] as const) {
      const out = normalizeAgentSources([
        {
          id: "source-1",
          title: "t",
          url: "https://example.com/",
          domain: "example.com",
          sourceType,
        },
      ]);
      assert.equal(out?.[0]?.sourceType, sourceType);
    }
  });

  it("URL segura solo http(s)", () => {
    assert.equal(isSafeHttpUrl("https://a.com"), true);
    assert.equal(isSafeHttpUrl("http://a.com"), true);
    assert.equal(isSafeHttpUrl("file:///etc/passwd"), false);
  });
});
