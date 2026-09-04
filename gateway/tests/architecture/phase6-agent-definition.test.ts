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
const DEFINITION = path.join(repoRoot, "gateway/src/agents/definition.ts");
const NODE_CONFIG = path.join(repoRoot, "node/src/config.ts");
const PHASE6 = path.join(repoRoot, "docs/architecture/phase6-agent-definition.md");
const PROTOCOL = path.join(repoRoot, "packages/protocol/messages.ts");
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup|NodeRegistry)\b/;

const IMPORT_RE =
  /import\s+(type\s+)?(?:[^;]*?)\s+from\s+["']([^"']+)["']/g;

describe("PHASE 6 Agent Definition", () => {
  it("una sola implementación de Agent Runtime", () => {
    const runtimes = walkTs(path.join(repoRoot, "gateway/src")).filter(
      (f) =>
        path.basename(f) === "runtime.ts" &&
        f.includes(`${path.sep}agents${path.sep}`),
    );
    assert.equal(runtimes.length, 1);
    assert.equal(runtimes[0], RUNTIME);
    const src = readFileSync(RUNTIME, "utf8");
    assert.match(src, /export function createAgentRuntime/);
    assert.doesNotMatch(src, /createWriterRuntime|BookRuntime|ResearchRuntime/);
  });

  it("Agent Definition no ejecuta y no importa infraestructura", () => {
    const src = readFileSync(DEFINITION, "utf8");
    assert.match(src, /export interface AgentDefinition/);
    assert.doesNotMatch(src, /runTurn|createAgentRuntime/);
    assert.doesNotMatch(src, /from ["']hono/);
    assert.doesNotMatch(src, /from ["']ws["']/);
    assert.doesNotMatch(src, /@modelcontextprotocol/);
    assert.doesNotMatch(src, /better-sqlite3/);
    assert.doesNotMatch(src, /from ["']node:fs/);
    assert.doesNotMatch(src, /attachLocalAgent|startLocalAgent/);
    assert.doesNotMatch(src, /\broot\?:/);
    assert.doesNotMatch(src, /\bworkspaceId\b/);
    // conversationId solo en comentario de MemoryPolicy (scope TurnMemory), no como campo.
    assert.doesNotMatch(src, /readonly conversationId/);
    assert.match(src, /readonly id: string/);
    assert.match(src, /readonly name: string/);
    assert.match(
      src,
      /AgentDefinition\.id|identidad lógica|installation/,
    );
  });

  it("filesystem.root pertenece al Node, no al Agent Definition", () => {
    const nodeCfg = readFileSync(NODE_CONFIG, "utf8");
    assert.match(nodeCfg, /filesystem/);
    assert.match(nodeCfg, /Local Node/);
    const def = readFileSync(DEFINITION, "utf8");
    assert.doesNotMatch(def, /root\?:/);
    assert.doesNotMatch(def, /AGENT_FILESYSTEM_ROOT/);
  });

  it("Runtime no depende de Node; usa LLM, Tools, TurnMemory, ConfirmationPort", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /attachLocalAgent|startLocalAgent/);
    assert.doesNotMatch(src, /from ["'].*agent\/src/);
    assert.match(src, /LLMProvider/);
    assert.match(src, /AgentRuntimeTools/);
    assert.match(src, /TurnMemory/);
    assert.match(src, /ConfirmationPort/);
    assert.match(src, /AgentDefinition/);
  });

  it("sin Capability*/registries; protocolo sin agentId/nodeId", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        assert.doesNotMatch(readFileSync(file, "utf8"), FORBIDDEN, file);
      }
    }
    const proto = readFileSync(PROTOCOL, "utf8");
    assert.doesNotMatch(proto, /\bagentId\b/);
    assert.doesNotMatch(proto, /\bnodeId\b/);
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/tools/calculator.ts")),
      false,
    );
  });

  it("docs: MCP Agent→Tool, A2A futuro, Workspace separado", () => {
    const doc = readFileSync(PHASE6, "utf8");
    assert.match(doc, /Agent Definition/);
    assert.match(doc, /MCP/);
    assert.match(doc, /A2A/);
    assert.match(doc, /Workspace/);
    assert.match(doc, /filesystem\.root/);
    assert.doesNotMatch(doc, /Control Plane/i);
    assert.doesNotMatch(doc, /^## Project/m);
  });

  it("definition.ts no importa Node lifecycle ni MCP SDK (grafo de imports)", () => {
    const src = readFileSync(DEFINITION, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[2]!;
      assert.equal(/hono|^ws$|@modelcontextprotocol|better-sqlite3|node:fs/.test(spec), false, spec);
    }
  });
});
