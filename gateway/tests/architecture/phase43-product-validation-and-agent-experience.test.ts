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

describe("PHASE 43 product validation & agent experience lab", () => {
  it("docs CLOSED; productive NONE; MVP verdict documented", () => {
    const doc = read(
      "docs/architecture/phase43-product-validation-and-agent-experience.md",
    );
    assert.match(doc, /PHASE 43 CLOSED/);
    assert.match(doc, /Productive code changed[\s\S]*NONE|NONE/);
    assert.match(doc, /MVP Verdict/);
    assert.match(doc, /MVP READY WITH DEBT|NOT MVP READY|MVP READY/);
    assert.match(doc, /B encontrados:\s*0/);
    assert.match(doc, /Scenario Matrix|Lab A|Lab K/);
  });

  it("no productive code modified for phase 43", () => {
    const doc = read(
      "docs/architecture/phase43-product-validation-and-agent-experience.md",
    );
    assert.match(doc, /NO modificar código productivo|Productive code changed[\s\S]*NONE/);
    assert.doesNotMatch(doc, /IMPLEMENTED.*Runtime|IMPLEMENTED.*MCP/);
  });

  it("Excel lab marked NOT TESTED when Windows unavailable", () => {
    const doc = read(
      "docs/architecture/phase43-product-validation-and-agent-experience.md",
    );
    assert.match(doc, /NOT TESTED.*Windows|Windows environment unavailable/i);
  });

  it("proxy evidence references existing tests not fabricated runtime", () => {
    const doc = read(
      "docs/architecture/phase43-product-validation-and-agent-experience.md",
    );
    assert.match(doc, /e2e-8d|ChatStoreInboundTest|conversation-messages/);
    assert.match(doc, /NOT TESTED \(manual\)|PROXY PASS/);
    assert.ok(
      existsSync(
        path.join(repoRoot, "gateway/tests/agent/e2e-8d.test.ts"),
      ),
    );
    assert.ok(
      existsSync(
        path.join(
          repoRoot,
          "mobile/android/app/src/test/java/mx/ideass/personal/agent/chat/ChatStoreInboundTest.kt",
        ),
      ),
    );
  });

  it("boundaries or doc lists phase 43 validation", () => {
    const boundaries = read("docs/architecture/boundaries.md");
    assert.match(boundaries, /PHASE 43|phase43-product-validation/);
  });
});
