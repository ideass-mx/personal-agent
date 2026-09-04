import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 53 gateway/agents/tools/node layout", () => {
  it("uses gateway/ and node/ packages on disk", () => {
    assert.ok(fs.existsSync(path.join(repoRoot, "gateway/package.json")));
    assert.ok(fs.existsSync(path.join(repoRoot, "node/package.json")));
    assert.equal(
      JSON.parse(read("gateway/package.json")).name,
      "@mxideass/gateway",
    );
    assert.equal(JSON.parse(read("node/package.json")).name, "@mxideass/node");
  });

  it("keeps MCP under tools/mcp not gateway/src/mcp", () => {
    assert.ok(
      fs.existsSync(path.join(repoRoot, "gateway/src/tools/mcp/stdio.ts")),
    );
    assert.equal(fs.existsSync(path.join(repoRoot, "gateway/src/mcp")), false);
    assert.equal(
      fs.existsSync(path.join(repoRoot, "gateway/src/gateway")),
      false,
    );
  });

  it("agents live under gateway/src/agents", () => {
    assert.ok(
      fs.existsSync(path.join(repoRoot, "gateway/src/agents/runtime.ts")),
    );
    assert.ok(
      fs.existsSync(path.join(repoRoot, "gateway/src/agents/registry.ts")),
    );
    assert.ok(
      fs.existsSync(path.join(repoRoot, "gateway/src/agents/manager.ts")),
    );
  });

  it("Agent Runtime does not import Electron", () => {
    const src = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(src, /electron|Electron/);
  });

  it("Node does not import Gateway HTTP stack", () => {
    const files = [
      "node/src/index.ts",
      "node/src/lifecycle.ts",
      "node/src/mcp/server.ts",
    ];
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /from ["'].*gateway\//);
      assert.doesNotMatch(src, /hono|@hono/);
    }
  });

  it("phase53 architecture doc exists", () => {
    const doc = read("docs/architecture/phase53-gateway-agents-tools-node.md");
    assert.match(doc, /Gateway/);
    assert.match(doc, /tools\/mcp/);
    assert.match(doc, /Node/);
    assert.match(doc, /HUB_TOKEN/);
  });
});
