/**
 * PHASE 64 — Structured UI contract tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeStructuredResult,
  FIXTURE_BY_ID,
  FIXTURE_RESEARCH_COMPLETED,
  isStructuredBlockType,
} from "../../src/experience/index.ts";

describe("PHASE 64 Structured UI contract", () => {
  it("serializes/deserializes research fixture", () => {
    const json = JSON.stringify(FIXTURE_RESEARCH_COMPLETED);
    const parsed = assertSafeStructuredResult(JSON.parse(json));
    assert.equal(parsed.blocks[0]?.type, "research");
    const research = parsed.blocks[0] as { status: string; resultCount?: number };
    assert.equal(research.status, "completed");
    assert.equal(research.resultCount, 14);
  });

  it("all fixture ids parse safely", () => {
    for (const [id, fixture] of Object.entries(FIXTURE_BY_ID)) {
      const again = assertSafeStructuredResult(
        JSON.parse(JSON.stringify(fixture)),
      );
      assert.ok(again.blocks.length > 0, id);
      for (const b of again.blocks) {
        assert.equal(isStructuredBlockType(b.type), true);
      }
    }
  });

  it("rejects HTML / script smuggling fields", () => {
    assert.throws(
      () =>
        assertSafeStructuredResult({
          blocks: [{ type: "card", title: "x", html: "<script>" }],
        }),
      /forbidden_field:html/,
    );
    assert.throws(
      () =>
        assertSafeStructuredResult({
          blocks: [{ type: "card", title: "x", dangerouslySetInnerHTML: {} }],
        }),
      /forbidden_field/,
    );
  });

  it("rejects unknown block types", () => {
    assert.throws(
      () =>
        assertSafeStructuredResult({
          blocks: [{ type: "iframe", src: "evil" }],
        }),
      /type_unknown/,
    );
  });
});
