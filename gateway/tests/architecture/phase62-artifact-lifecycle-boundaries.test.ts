/**
 * PHASE 62 — fronteras lifecycle / ArtifactReference / ObjectStorage / MCP.
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

describe("PHASE 62 architecture boundaries", () => {
  it("docs + migration", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_62_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_62_DESIGN.md")));
    const sql = read("db/migrations/007_artifact_lifecycle.sql");
    assert.match(sql, /status/);
    assert.match(sql, /expires_at/);
  });

  it("ObjectStorage does not import ArtifactManager / ResourceResolver / Runtime", () => {
    for (const file of listTs("gateway/src/storage")) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /from ["'][^"']*artifacts/);
      assert.doesNotMatch(src, /from ["'][^"']*resources/);
      assert.doesNotMatch(src, /from ["'][^"']*agents\/runtime/);
    }
  });

  it("ArtifactReference type excludes storage details", () => {
    const types = read("gateway/src/artifacts/types.ts");
    assert.match(types, /ArtifactReference/);
    const refBlock = types.slice(types.indexOf("ArtifactReference"));
    const end = refBlock.indexOf("export function");
    const block = refBlock.slice(0, end > 0 ? end : 400);
    assert.doesNotMatch(block, /provider|storageKey|bucket|ObjectReference/);
    assert.match(block, /artifactId/);
    assert.match(block, /url/);
  });

  it("HTTP DELETE mounted; delivery URL canonical", () => {
    const http = read("gateway/src/http/artifact-http.ts");
    assert.match(http, /app\.delete\(["']\/artifacts\/:artifactId/);
    assert.match(http, /artifact_expired/);
    assert.match(http, /410/);
  });

  it("MCP protocol has no artifact://", () => {
    assert.doesNotMatch(read("packages/protocol/PROTOCOL.md"), /artifact:\/\//i);
  });

  it("ToolResult allows optional artifacts without replacing content", () => {
    const types = read("gateway/src/tools/types.ts");
    assert.match(types, /artifacts\?:/);
    assert.match(types, /content:/);
  });

  it("no ArtifactService/LifecycleManager layers", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/artifacts/service.ts")),
      false,
    );
    assert.equal(
      existsSync(
        path.join(repoRoot, "gateway/src/artifacts/lifecycle-manager.ts"),
      ),
      false,
    );
  });
});
