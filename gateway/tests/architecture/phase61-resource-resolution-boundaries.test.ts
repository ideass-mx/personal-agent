/**
 * PHASE 61 — fronteras ResourceResolver / Artifact / ObjectStorage / MCP.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

function listTs(dirRel: string): string[] {
  const abs = path.join(repoRoot, dirRel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith(".ts")) out.push(p);
    }
  };
  walk(abs);
  return out;
}

describe("PHASE 61 architecture boundaries", () => {
  it("docs existen", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_61_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_61_DESIGN.md")));
  });

  it("ResourceResolver does not import MCP server / S3 SDK / LocalObjectStorage", () => {
    for (const file of listTs("gateway/src/resources")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /from ["']@aws-sdk/);
      assert.doesNotMatch(src, /from ["'][^"']*storage\/local/);
      assert.doesNotMatch(src, /from ["'][^"']*storage\/providers/);
      assert.doesNotMatch(src, /from ["'][^"']*node\/src/);
      assert.doesNotMatch(src, /from ["'][^"']*tools\/mcp\/stdio/);
    }
    const resolve = read("gateway/src/resources/resolve.ts");
    assert.match(resolve, /ArtifactManager/);
    assert.match(resolve, /persist/);
  });

  it("ObjectStorage does not depend on ResourceResolver / MCP", () => {
    for (const file of listTs("gateway/src/storage")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /from ["'][^"']*resources/);
      assert.doesNotMatch(src, /ResourceResolver|extractResources/);
      assert.doesNotMatch(src, /from ["'][^"']*mcp-result/);
    }
  });

  it("Artifact type does not contain bytes", () => {
    const types = read("gateway/src/artifacts/types.ts");
    assert.doesNotMatch(types, /bytes\s*:/);
    assert.match(types, /storage:\s*ObjectReference/);
  });

  it("defaults: allowExternal=false persist=false", () => {
    const policy = read("gateway/src/resources/policy.ts");
    assert.match(policy, /allowExternal:\s*false/);
    assert.match(policy, /persist:\s*false/);
  });

  it("no ResourceService/Repository layers", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/resources/service.ts")),
      false,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/resources/repository.ts")),
      false,
    );
  });
});
