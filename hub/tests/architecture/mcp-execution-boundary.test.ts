import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

const MCP_SDK = /@modelcontextprotocol/;
const CAPABILITY_ABSTRACTION =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup)\b/;

describe("MCP-first execution boundary", () => {
  it("Agent Runtime no importa MCP SDK, Hono, WS, SQLite, fs, Excel ni process", () => {
    const src = readFileSync(
      path.join(repoRoot, "hub/src/agent/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, MCP_SDK);
    assert.doesNotMatch(src, /from ["']hono/);
    assert.doesNotMatch(src, /from ["']ws["']/);
    assert.doesNotMatch(src, /better-sqlite3/);
    assert.doesNotMatch(src, /from ["']node:fs/);
    assert.doesNotMatch(src, /from ["']node:child_process/);
    assert.doesNotMatch(src, /winax|excel-com|Excel\.Application/);
    assert.doesNotMatch(src, /mcp-stdio|mcp-executor|createMcpRemoteExecutor/);
    assert.doesNotMatch(src, /from ["'].*tools\/registry/);
  });

  it("MCP Adapter es el único código de producción del Hub que importa el SDK MCP", () => {
    const allowed = new Set([
      path.join(repoRoot, "hub/src/tools/mcp-stdio.ts"),
      path.join(repoRoot, "hub/src/tools/mcp-executor.ts"),
    ]);
    const hits: string[] = [];
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      if (MCP_SDK.test(text) && !allowed.has(file)) {
        hits.push(path.relative(repoRoot, file));
      }
    }
    assert.deepEqual(hits, []);
  });

  it("no hay abstracción Capability/ToolLookup en código de producción", () => {
    for (const dir of [
      path.join(repoRoot, "hub/src"),
      path.join(repoRoot, "agent/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, CAPABILITY_ABSTRACTION, file);
        assert.doesNotMatch(text, /\b(interface|type|class) Capability\b/, file);
      }
    }
  });

  it("el proceso agent/ es MCP Server, no Agent Runtime", () => {
    const index = readFileSync(
      path.join(repoRoot, "agent/src/index.ts"),
      "utf8",
    );
    const life = readFileSync(
      path.join(repoRoot, "agent/src/lifecycle.ts"),
      "utf8",
    );
    assert.match(index, /MCP Server/);
    assert.match(index, /No es un Agent lógico/);
    assert.doesNotMatch(index, /createAgentRuntime/);
    assert.doesNotMatch(life, /createAgentRuntime/);
    assert.match(life, /MCP Server/);
  });

  it("docs fijan Agent ≠ Runtime ≠ MCP Server y MCP ≠ A2A", () => {
    const terminology = readFileSync(
      path.join(repoRoot, "docs/architecture/terminology.md"),
      "utf8",
    );
    const boundaries = readFileSync(
      path.join(repoRoot, "docs/architecture/boundaries.md"),
      "utf8",
    );
    const combined = `${terminology}\n${boundaries}`;
    assert.match(combined, /Agent ≠ MCP Server|Un Agent \*\*no\*\* es un MCP Server/);
    assert.match(combined, /MCP vs A2A|MCP ≠ A2A/);
    assert.match(combined, /Tool \(canónico\)|concepto canónico/);
    assert.match(combined, /MCP Adapter/);
    assert.match(combined, /Workspace ≠ Conversation|no es Workspace/);
  });
});
