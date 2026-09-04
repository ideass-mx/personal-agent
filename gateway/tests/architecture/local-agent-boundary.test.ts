import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("arquitectura: Hub ↔ Agent (documentación)", () => {
it("docs/architecture.md define Gateway vs Node y separa MCP de Agent", () => {
    const text = readFileSync(
      path.join(repoRoot, "docs/architecture.md"),
      "utf8",
    );
    assert.match(text, /Gateway/);
    assert.match(text, /Node/);
    assert.match(text, /MCP/);
    assert.match(text, /gateway\//);
    assert.match(text, /node\//);
  });


  it("node/ es el proceso MCP; no hay tercer proceso", () => {
    assert.equal(existsSync(path.join(repoRoot, "node/src/index.ts")), true);
    assert.equal(existsSync(path.join(repoRoot, "node/src/lifecycle.ts")), true);
    assert.equal(existsSync(path.join(repoRoot, "node/src/guardian")), false);
    // Un directorio sibling `guardian/` no forma parte del pipeline Hub↔Agent.
    assert.equal(existsSync(path.join(repoRoot, "node/src/filesystem")), false);
    assert.equal(existsSync(path.join(repoRoot, "node/src/shell")), false);
    assert.equal(existsSync(path.join(repoRoot, "agent-windows")), false);
    assert.equal(existsSync(path.join(repoRoot, "agent-linux")), false);
    assert.equal(existsSync(path.join(repoRoot, "node")), true); // PHASE 53 product Node
    assert.equal(existsSync(path.join(repoRoot, "api")), false);
  });

  it("monorepo sin workspaces: deps por paquete, agent con MCP spike", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { workspaces?: string[] };
    assert.equal(pkg.workspaces, undefined);
  });

  it("@mxideass/node declara identidad y dependencia MCP (sin tools privilegiadas)", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "node/package.json"), "utf8"),
    ) as {
      name: string;
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.name, "@mxideass/node");
    assert.equal(pkg.private, true);
    assert.ok(pkg.dependencies?.["@modelcontextprotocol/sdk"]);
    assert.equal(pkg.dependencies?.["express"], undefined);
  });
});
