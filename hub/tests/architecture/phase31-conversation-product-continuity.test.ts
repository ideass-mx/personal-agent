import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 31 conversation product continuity (audit)", () => {
  it("docs: CLOSED; READY WITH DEBT; PHASE 32 closed implementation", () => {
    const doc = readFileSync(
      path.join(
        repoRoot,
        "docs/architecture/phase31-conversation-product-continuity.md",
      ),
      "utf8",
    );
    assert.match(doc, /PHASE 31 CLOSED/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /PHASE 32 CLOSED/);
    assert.match(doc, /D-31-02|cross-talk/i);
    assert.match(doc, /G-31-03|History API/i);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("docs: hallazgos G-31-03 y D-31-02 documentados (pre-PHASE-32)", () => {
    const doc = readFileSync(
      path.join(
        repoRoot,
        "docs/architecture/phase31-conversation-product-continuity.md",
      ),
      "utf8",
    );
    assert.match(doc, /G-31-03/);
    assert.match(doc, /D-31-02/);
    assert.match(doc, /DataStore.*autoridad accidental/i);
  });
});
