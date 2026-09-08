/**
 * PHASE 60.15.1 — recolección de fuentes desde research.* tool results.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTurnSourceCollector } from "../../src/agents/sources.ts";

describe("PHASE 60.15.1 turn source collector", () => {
  it("dedupe por URL y asigna source-N", () => {
    const c = createTurnSourceCollector();
    c.ingestTool("research.search", {
      ok: true,
      content: {
        query: "PostgreSQL 17",
        provider: "web",
        results: [
          {
            title: "PG17",
            url: "https://www.postgresql.org/docs/17/release-17.html",
            domain: "www.postgresql.org",
            snippet: "notes",
            sourceFamily: "web",
          },
          {
            title: "Wiki",
            url: "https://en.wikipedia.org/wiki/PostgreSQL",
            domain: "en.wikipedia.org",
            sourceFamily: "knowledge",
          },
        ],
      },
    });
    c.ingestTool("research.fetch", {
      ok: true,
      content: {
        url: "https://www.postgresql.org/docs/17/release-17.html",
        finalUrl: "https://www.postgresql.org/docs/17/release-17.html",
        title: "PostgreSQL 17 Release Notes",
        text: "…",
      },
    });
    const sources = c.finalize();
    assert.equal(sources.length, 2);
    assert.equal(sources[0]?.id, "source-1");
    assert.equal(sources[1]?.id, "source-2");
    assert.equal(sources[0]?.sourceType, "web");
    assert.equal(sources[1]?.sourceType, "knowledge");
    assert.match(sources[0]?.title ?? "", /PostgreSQL 17/);
  });

  it("academic sourceType desde sourceFamily", () => {
    const c = createTurnSourceCollector();
    c.ingestTool("research.search", {
      ok: true,
      content: {
        results: [
          {
            title: "LLM Agents",
            url: "https://arxiv.org/abs/2401.00001",
            domain: "arxiv.org",
            sourceFamily: "academic",
          },
        ],
      },
    });
    const sources = c.finalize();
    assert.equal(sources[0]?.sourceType, "academic");
  });

  it("ignora tools no research y errores", () => {
    const c = createTurnSourceCollector();
    c.ingestTool("fs.read", {
      ok: true,
      content: { path: "/tmp" },
    });
    c.ingestTool("research.search", {
      ok: false,
      error: { code: "x", message: "fail" },
    });
    assert.equal(c.finalize().length, 0);
  });
});
