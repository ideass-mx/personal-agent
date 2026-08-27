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

describe("PHASE 49 Agent Console product definition", () => {
  it("docs READY FOR IMPLEMENTATION; productive NONE; designed", () => {
    const doc = read(
      "docs/architecture/phase49-agent-console-product-definition.md",
    );
    assert.match(doc, /PHASE 49 CLOSED/);
    assert.match(doc, /READY FOR IMPLEMENTATION/);
    assert.match(doc, /Productive code changed[\s\S]*NONE|NONE/);
    assert.match(doc, /\*\*designed\*\*/);
    assert.match(doc, /not implemented/);
    assert.match(doc, /Architecture Changes[\s\S]*NONE/);
  });

  it("sibling docs exist and align", () => {
    for (const rel of [
      "docs/architecture/agent-console-navigation.md",
      "docs/architecture/agent-console-api-contract.md",
      "docs/architecture/agent-console-security-boundary.md",
      "docs/architecture/agent-console-first-run.md",
    ]) {
      assert.ok(existsSync(path.join(repoRoot, rel)), rel);
    }
    const nav = read("docs/architecture/agent-console-navigation.md");
    assert.match(nav, /Overview/);
    assert.match(nav, /Chat/);
    assert.match(nav, /Capabilities/);
    assert.match(nav, /Diagnostics/);
  });

  it("USE vs MANAGE and Windows tray reduction documented", () => {
    const doc = read(
      "docs/architecture/phase49-agent-console-product-definition.md",
    );
    assert.match(doc, /USE/);
    assert.match(doc, /MANAGE/);
    assert.match(doc, /Tray|tray/);
    assert.match(doc, /no debe evolucionar a una segunda UI|segunda UI administrativa/i);
  });

  it("API contract classifies EXISTING REUSE REQUIRED FUTURE", () => {
    const api = read("docs/architecture/agent-console-api-contract.md");
    assert.match(api, /EXISTING/);
    assert.match(api, /REUSE/);
    assert.match(api, /REQUIRED/);
    assert.match(api, /FUTURE/);
    assert.match(api, /\/health/);
    assert.match(api, /confirm_request/);
    assert.match(api, /user_message/);
  });

  it("security forbids direct FS MCP process; preserves Gateway authority", () => {
    const sec = read("docs/architecture/agent-console-security-boundary.md");
    assert.match(sec, /filesystem directo|FS directo/i);
    assert.match(sec, /MCP directo/);
    assert.match(sec, /ConfirmationWaiter/);
    assert.match(sec, /HUB_TOKEN/);
    assert.doesNotMatch(sec, /PermissionManager implement/i);
  });

  it("first-run avoids npm happy path; Internet remote is future", () => {
    const fr = read("docs/architecture/agent-console-first-run.md");
    assert.match(fr, /Agent Ready|AGENT READY/);
    assert.match(fr, /npm/);
    const doc = read(
      "docs/architecture/phase49-agent-console-product-definition.md",
    );
    assert.match(doc, /Internet[\s\S]*FUTURE|FUTURE[\s\S]*Internet/i);
    assert.match(doc, /PHASE 50/);
  });

  it("PHASE 49 claimed no productive SPA; protocol untouched; PHASE 50 owns web/", () => {
    // PHASE 49 was design-only; Agent Console lives in web/ as of PHASE 50.
    const doc = read(
      "docs/architecture/phase49-agent-console-product-definition.md",
    );
    assert.match(doc, /Productive code changed[\s\S]*NONE|NONE/);
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /PHASE 49/);
    const boundaries = read("docs/architecture/boundaries.md");
    assert.match(boundaries, /PHASE 49|phase49-agent-console/);
    assert.ok(
      existsSync(path.join(repoRoot, "web/package.json")),
      "PHASE 50 Agent Console expected at web/",
    );
  });
});
