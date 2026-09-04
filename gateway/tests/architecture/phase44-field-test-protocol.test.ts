import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 44 field test protocol", () => {
  it("docs CLOSED; BLOCKED or field results; productive NONE", () => {
    const doc = read("docs/architecture/phase44-field-test-protocol.md");
    assert.match(doc, /PHASE 44 CLOSED/);
    assert.match(doc, /Decision[\s\S]*BLOCKED|PASS|READY WITH DEBT/);
    assert.match(doc, /Productive Code Changed[\s\S]*NONE|NONE/);
    assert.match(doc, /NOT TESTED/);
  });

  it("operator checklist and preflight script exist", () => {
    assert.ok(existsSync(path.join(repoRoot, "docs/field-test-checklist.md")));
    assert.ok(
      existsSync(path.join(repoRoot, "scripts/field-test-preflight.mjs")),
    );
    const checklist = read("docs/field-test-checklist.md");
    assert.match(checklist, /K1|K3|D1|HITL Background/);
  });

  it("Excel marked mandatory on Windows; no simulated pass", () => {
    const doc = read("docs/architecture/phase44-field-test-protocol.md");
    assert.match(doc, /Windows environment unavailable|Windows obligatorio/i);
    assert.doesNotMatch(doc, /D1.*PASS[\s\S]{0,80}Linux/i);
  });

  it("does not require productive code changes", () => {
    const doc = read("docs/architecture/phase44-field-test-protocol.md");
    assert.match(doc, /Architecture Changes[\s\S]*NONE/);
    assert.match(doc, /NO implementar|Productive Code Changed[\s\S]*NONE/);
  });

  it("boundaries reference phase 44", () => {
    const boundaries = read("docs/architecture/boundaries.md");
    assert.match(boundaries, /PHASE 44|phase44-field-test/);
  });
});
