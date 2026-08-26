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
  it("docs/architecture.md define cerebro vs Agent y separa MCP de Agent", () => {
    const text = readFileSync(
      path.join(repoRoot, "docs/architecture.md"),
      "utf8",
    );
    assert.match(text, /Hub = cerebro/i);
    assert.match(text, /cerebro del sistema/i);
    assert.match(text, /Agent = garras/i);
    assert.match(text, /MCP ≠ Agent/);
    assert.match(text, /RemoteToolRequest/);
    assert.match(text, /RemoteToolResponse/);
    assert.match(text, /`agent\/`/);
    assert.match(text, /multiplataforma/i);
    assert.match(text, /Un solo Agent/i);
    assert.match(text, /confirmación|Confirmation/i);
    assert.match(text, /hub\/src\/agent\//);
    assert.match(text, /Plugin ≠ proceso/);
    assert.match(
      text,
      /Una Agent Extension es código integrado estáticamente/,
    );
    assert.match(text, /El Hub decide `executionMode`/);
    assert.doesNotMatch(text, /├── agent-windows/);
    assert.doesNotMatch(text, /├── agent-linux/);
  });

  it("agent/ es el proceso MCP; no hay tercer proceso", () => {
    assert.equal(existsSync(path.join(repoRoot, "agent/src/index.ts")), true);
    assert.equal(existsSync(path.join(repoRoot, "agent/src/lifecycle.ts")), true);
    assert.equal(existsSync(path.join(repoRoot, "agent/src/guardian")), false);
    // Un directorio sibling `guardian/` no forma parte del pipeline Hub↔Agent.
    assert.equal(existsSync(path.join(repoRoot, "agent/src/filesystem")), false);
    assert.equal(existsSync(path.join(repoRoot, "agent/src/shell")), false);
    assert.equal(existsSync(path.join(repoRoot, "agent-windows")), false);
    assert.equal(existsSync(path.join(repoRoot, "agent-linux")), false);
    assert.equal(existsSync(path.join(repoRoot, "node")), false);
    assert.equal(existsSync(path.join(repoRoot, "api")), false);
  });

  it("monorepo sin workspaces: deps por paquete, agent con MCP spike", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { workspaces?: string[] };
    assert.equal(pkg.workspaces, undefined);
  });

  it("@mxideass/agent declara identidad y dependencia MCP (sin tools privilegiadas)", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "agent/package.json"), "utf8"),
    ) as {
      name: string;
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.name, "@mxideass/agent");
    assert.equal(pkg.private, true);
    assert.ok(pkg.dependencies?.["@modelcontextprotocol/sdk"]);
    assert.equal(pkg.dependencies?.["express"], undefined);
  });
});
