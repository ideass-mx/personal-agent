import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("PHASE 36 product definition & Hub-first MVP", () => {
  it("docs: CLOSED; READY FOR PHASE 37; no productive code", () => {
    const doc = read(
      "docs/architecture/phase36-product-definition-and-hub-first-mvp.md",
    );
    assert.match(doc, /PHASE 36 CLOSED/);
    assert.match(doc, /READY FOR PHASE 37/);
    assert.match(doc, /Productive Code Changed:\s*\*\*NONE\*\*/);
    assert.match(doc, /Hub-first UX/);
    assert.match(doc, /D-35-01/);
    assert.match(doc, /D-34-01/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("product vision and MVP boundary are explicit", () => {
    const doc = read(
      "docs/architecture/phase36-product-definition-and-hub-first-mvp.md",
    );
    assert.match(doc, /Product vision/);
    assert.match(doc, /\*\*Conversation\*\*/);
    assert.match(doc, /Dentro del MVP/);
    assert.match(doc, /Fuera del MVP/);
    assert.match(doc, /User \/ ACL/);
    assert.match(doc, /OpenClaw/);
    assert.match(doc, /LEGACY/);
  });

  it("roadmap starts with Hub-first then HITL; no PermissionManager", () => {
    const doc = read(
      "docs/architecture/phase36-product-definition-and-hub-first-mvp.md",
    );
    assert.match(doc, /\*\*37\*\*.*Hub-first/);
    assert.match(doc, /\*\*38\*\*.*HITL/);
    assert.match(doc, /PermissionManager/);
    assert.match(doc, /no PermissionManager|No\*\* introducir PermissionManager|\*\*No\*\* introducir PermissionManager/i);
  });

  it("architecture stay-out: Runtime/MCP/policy unchanged by this phase", () => {
    const doc = read(
      "docs/architecture/phase36-product-definition-and-hub-first-mvp.md",
    );
    assert.match(doc, /Arquitectura que NO debe cambiar/);
    assert.match(doc, /MCP stdio/);
    assert.match(doc, /deny-by-default/);
    assert.match(doc, /HUB_TOKEN/);
  });

  it("next implement first is Hub-first (D-35-01), not voice/installer", () => {
    const doc = read(
      "docs/architecture/phase36-product-definition-and-hub-first-mvp.md",
    );
    assert.match(doc, /Implementar primero[\s\S]*Hub/);
    assert.match(doc, /Voice = post-MVP|Voice[\s\S]*\*\*no\*\*/);
    assert.match(doc, /Installer \/ updater[\s\S]*\*\*no\*\*/);
  });
});
