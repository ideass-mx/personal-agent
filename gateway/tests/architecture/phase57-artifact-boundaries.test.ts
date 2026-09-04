/**
 * PHASE 57 — fronteras: Runtime no conoce ObjectStorage; MCP no conoce Artifact.
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

describe("PHASE 57 architecture boundaries", () => {
  it("docs audit + design existen", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_57_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_57_DESIGN.md")));
    assert.ok(
      existsSync(path.join(repoRoot, "db/migrations/005_artifacts.sql")),
    );
  });

  it("AgentRuntime no importa storage/artifacts/mcp-result", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(runtime, /from ["'].*storage/);
    assert.doesNotMatch(runtime, /from ["'].*artifacts/);
    assert.doesNotMatch(runtime, /from ["'].*mcp-result/);
    assert.doesNotMatch(runtime, /LocalObjectStorage|ArtifactManager|S3/);
  });

  it("Node MCP server no menciona Artifact", () => {
    const mcp = read("node/src/mcp/server.ts");
    assert.doesNotMatch(mcp, /Artifact|ObjectStorage|artifact:\/\//i);
  });

  it("ObjectStorage interface no conoce MCP/Runtime", () => {
    const types = read("gateway/src/storage/types.ts");
    assert.doesNotMatch(types, /from ["'].*agents/);
    assert.doesNotMatch(types, /from ["'].*mcp/);
    assert.doesNotMatch(types, /from ["'].*tools\/mcp/);
    assert.doesNotMatch(types, /AgentRuntime|HUB_TOKEN|anthropic/i);
    const local = read("gateway/src/storage/local.ts");
    assert.doesNotMatch(local, /from ["'].*agents/);
    assert.doesNotMatch(local, /from ["'].*mcp/);
    assert.doesNotMatch(local, /callTool|HUB_TOKEN/);
  });

  it("RemoteAgentTool envelope intacto (ToolResult ok/content)", () => {
    const remote = read("gateway/src/tools/remote.ts");
    assert.match(remote, /isToolResult/);
    assert.match(remote, /requestId/);
    const types = read("gateway/src/tools/types.ts");
    assert.match(types, /ok: true/);
    assert.match(types, /ok: false/);
  });
});
