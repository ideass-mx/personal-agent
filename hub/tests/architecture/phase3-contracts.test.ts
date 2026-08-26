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

const RUNTIME = path.join(repoRoot, "hub/src/agent/runtime.ts");
const PORT = path.join(repoRoot, "hub/src/agent/confirmation.ts");
const WAITER = path.join(repoRoot, "hub/src/http/confirmation-waiter.ts");
const MEMORY = path.join(repoRoot, "hub/src/memory/types.ts");
const SQLITE = path.join(repoRoot, "hub/src/memory/sqlite-turn-memory.ts");
const INDEX = path.join(repoRoot, "hub/src/index.ts");
const TERMINOLOGY = path.join(repoRoot, "docs/architecture/terminology.md");
const PHASE3 = path.join(repoRoot, "docs/architecture/phase3-contracts.md");

const FORBIDDEN_ABSTRACTION =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup)\b/;

describe("PHASE 3 contratos", () => {
  it("runtime.ts no importa MCP SDK, Hono, WS, SQLite, fs ni implementaciones de Tools", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /@modelcontextprotocol/);
    assert.doesNotMatch(src, /from ["']hono/);
    assert.doesNotMatch(src, /from ["']ws["']/);
    assert.doesNotMatch(src, /better-sqlite3/);
    assert.doesNotMatch(src, /sqlite-turn-memory|memory\/history/);
    assert.doesNotMatch(src, /from ["']node:fs/);
    assert.doesNotMatch(src, /from ["']node:child_process/);
    assert.doesNotMatch(src, /winax|excel-com/);
    assert.doesNotMatch(src, /mcp-stdio|mcp-executor|createRemoteAgentTool/);
    assert.doesNotMatch(src, /tools\/registry/);
    assert.doesNotMatch(src, /calculator/);
    assert.match(src, /LLMProvider/);
    assert.match(src, /AgentRuntimeTools/);
    assert.match(src, /TurnMemory/);
    assert.match(src, /ConfirmationPort/);
  });

  it("Agent Runtime no depende de la clase ToolRegistry", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.match(src, /export interface AgentRuntimeTools/);
    assert.doesNotMatch(src, /class ToolRegistry/);
    assert.doesNotMatch(src, /from ["'].*tools\/registry/);
  });

  it("no existe calculator in-process; Tools productivas vía MCP", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "hub/src/tools/calculator.ts")),
      false,
    );
    const index = readFileSync(INDEX, "utf8");
    assert.doesNotMatch(index, /calculator/);
    assert.doesNotMatch(index, /tools\.register\(/);
    assert.match(index, /attachLocalAgent/);
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /calculatorTool/, file);
    }
  });

  it("ConfirmationPort en Runtime; ConfirmationWaiter en Gateway", () => {
    const runtime = readFileSync(RUNTIME, "utf8");
    const port = readFileSync(PORT, "utf8");
    const waiter = readFileSync(WAITER, "utf8");
    assert.match(runtime, /from ["']\.\/confirmation\.ts["']/);
    assert.doesNotMatch(runtime, /createConfirmationWaiter|ConfirmationWaiter/);
    assert.match(port, /export interface ConfirmationPort/);
    assert.doesNotMatch(port, /createConfirmationWaiter/);
    assert.match(waiter, /export function createConfirmationWaiter/);
    assert.equal(existsSync(WAITER), true);
  });

  it("TurnMemory es puerto; SQLite es adapter", () => {
    const mem = readFileSync(MEMORY, "utf8");
    const sql = readFileSync(SQLITE, "utf8");
    const runtime = readFileSync(RUNTIME, "utf8");
    assert.match(mem, /export interface TurnMemory/);
    assert.doesNotMatch(mem, /better-sqlite3/);
    assert.match(sql, /class SqliteTurnMemory implements TurnMemory/);
    assert.match(sql, /from ["']\.\/history\.ts["']/);
    assert.doesNotMatch(runtime, /SqliteTurnMemory|better-sqlite3/);
  });

  it("MCP SDK solo en adapters del Hub; sin ToolLookup ni Capability*", () => {
    const allowed = new Set([
      path.join(repoRoot, "hub/src/tools/mcp-stdio.ts"),
      path.join(repoRoot, "hub/src/tools/mcp-executor.ts"),
    ]);
    const sdkHits: string[] = [];
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      if (/@modelcontextprotocol/.test(text) && !allowed.has(file)) {
        sdkHits.push(path.relative(repoRoot, file));
      }
      assert.doesNotMatch(text, FORBIDDEN_ABSTRACTION, file);
      assert.doesNotMatch(text, /\b(interface|type|class) Capability\b/, file);
    }
    assert.deepEqual(sdkHits, []);
    for (const file of walkTs(path.join(repoRoot, "agent/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, FORBIDDEN_ABSTRACTION, file);
    }
  });

  it("docs oficiales: Tool canónico; Agent ≠ MCP Server; MCP ≠ A2A", () => {
    const terminology = readFileSync(TERMINOLOGY, "utf8");
    const phase3 = readFileSync(PHASE3, "utf8");
    assert.match(terminology, /\*\*Tool\*\*/);
    assert.doesNotMatch(terminology, /\n\| \*\*Capability\*\* \|/);
    assert.doesNotMatch(terminology, /\n\| \*\*Project\*\* \|/);
    assert.match(phase3, /Agent Runtime/);
    assert.match(phase3, /MCP Server/);
    assert.match(phase3, /A2A nunca sustituye MCP|MCP no lo sustituye/);
    assert.match(phase3, /Node ≠ Agent/);
    assert.match(phase3, /Workspace/);
    assert.doesNotMatch(phase3, /Control Plane/i);
  });
});
