import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeToolProgressDetail } from "../../src/agents/tool-progress-detail.ts";

describe("safeToolProgressDetail", () => {
  it("extrae query de research.search", () => {
    assert.equal(
      safeToolProgressDetail("research.search", {
        query: "doctorados en Tlaxcala",
      }),
      "doctorados en Tlaxcala",
    );
  });

  it("extrae host de research.fetch", () => {
    assert.equal(
      safeToolProgressDetail("research.fetch", {
        url: "https://www.example.edu/path?q=1",
      }),
      "www.example.edu",
    );
  });

  it("no inventa detail sin campos conocidos", () => {
    assert.equal(safeToolProgressDetail("agent.echo", { x: 1 }), undefined);
  });
});
