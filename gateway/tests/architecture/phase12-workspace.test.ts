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

const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const TYPES = path.join(repoRoot, "gateway/src/workspace/types.ts");
const ADAPTER = path.join(
  repoRoot,
  "gateway/src/workspace/sqlite-workspace-store.ts",
);
const INDEX = path.join(repoRoot, "gateway/src/index.ts");
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const NODE_CFG = path.join(repoRoot, "node/src/config.ts");
const DEFINITION = path.join(repoRoot, "gateway/src/agents/definition.ts");
const PHASE12 = path.join(
  repoRoot,
  "docs/architecture/phase12-workspace-persistence.md",
);
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup|NodeRegistry|WorkspaceManager|ContextManager)\b/;

describe("PHASE 12 Workspace persistence (arquitectura)", () => {
  it("Runtime no conoce Workspace ni SQLite", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /\bWorkspace\b/);
    assert.doesNotMatch(src, /WorkspaceStore|sqlite-workspace-store/);
    assert.doesNotMatch(src, /better-sqlite3/);
    assert.doesNotMatch(src, /from ["'].*db\/database/);
  });

  it("puerto sin SQLite/WS/MCP; adapter sin WS/MCP/Node/Agent", () => {
    const types = readFileSync(TYPES, "utf8");
    assert.match(types, /export interface WorkspaceStore/);
    assert.doesNotMatch(types, /better-sqlite3/);
    assert.doesNotMatch(types, /from ["']hono|from ["']ws["']/);
    assert.doesNotMatch(types, /@modelcontextprotocol/);
    const adapter = readFileSync(ADAPTER, "utf8");
    assert.match(adapter, /class SqliteWorkspaceStore implements WorkspaceStore/);
    assert.doesNotMatch(adapter, /from ["']hono|from ["']ws["']/);
    assert.doesNotMatch(adapter, /@modelcontextprotocol|mcp-stdio/);
    assert.doesNotMatch(adapter, /from ["']\.\.\/agent\/definition/);
    assert.doesNotMatch(adapter, /AGENT_FILESYSTEM_ROOT/);
  });

  it("Gateway compone el store; Session no es Workspace; root no es Workspace", () => {
    assert.match(readFileSync(INDEX, "utf8"), /createSqliteWorkspaceStore/);
    assert.doesNotMatch(readFileSync(INDEX, "utf8"), /createAgentRuntime\(\{[^}]*workspaces/);
    const sessions = readFileSync(SESSIONS, "utf8");
    assert.doesNotMatch(sessions, /WorkspaceStore|workspaceId/);
    assert.match(readFileSync(NODE_CFG, "utf8"), /AGENT_FILESYSTEM_ROOT/);
    assert.doesNotMatch(readFileSync(DEFINITION, "utf8"), /WorkspaceStore/);
  });

  it("sin agentId/nodeId/Capability*/Context entidad; protocolo sin workspaceId", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, FORBIDDEN, file);
        const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
        if (rel.endsWith("config.ts") || rel.includes("/pairing/") || rel.includes("pairing-http") || rel.includes("agents/registry") || rel.includes("agents/manager") || rel.includes("agents/definition") || rel.includes("http/server.ts")) {
          continue;
        }
        assert.doesNotMatch(text, /\bagentId\b/, file);
        assert.doesNotMatch(text, /\bnodeId\b/, file);
      }
    }
    const proto = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /workspaceId/);
    assert.match(proto, /conversationId/);
    const types = readFileSync(TYPES, "utf8");
    assert.doesNotMatch(types, /export interface Context\b/);
    assert.doesNotMatch(types, /conversationId/);
  });

  it("docs CURRENT vs FUTURE; sin FK Conversation", () => {
    const doc = readFileSync(PHASE12, "utf8");
    assert.match(doc, /WorkspaceStore/);
    assert.match(doc, /CURRENT|Gateway/);
    assert.match(doc, /optional|opcional/i);
    assert.match(doc, /deleteWorkspace/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });
});
