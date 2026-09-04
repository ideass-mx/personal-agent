/**
 * PHASE 58 — fronteras HTTP Artifact.
 */
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

describe("PHASE 58 architecture boundaries", () => {
  it("docs audit + design", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_58_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_58_DESIGN.md")));
  });

  it("artifact-http no importa LocalObjectStorage ni fs", () => {
    const http = read("gateway/src/http/artifact-http.ts");
    assert.doesNotMatch(http, /from ["'].*storage\/local/);
    assert.doesNotMatch(http, /from ["']node:fs["']/);
    assert.doesNotMatch(http, /createLocalObjectStorage/);
    assert.match(http, /ArtifactManager/);
    assert.match(http, /openReadStream/);
  });

  it("AgentRuntime intacto respecto a artifact-http", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(runtime, /artifact-http|ArtifactManager|\/artifacts\//);
  });

  it("index cablea artifacts a startServer", () => {
    const index = read("gateway/src/index.ts");
    assert.match(index, /artifacts:\s*artifactManager/);
  });
});
