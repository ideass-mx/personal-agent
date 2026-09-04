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
const GATEWAY_CFG = path.join(repoRoot, "gateway/src/config.ts");
const NODE_CFG = path.join(repoRoot, "node/src/config.ts");
const PHASE8 = path.join(
  repoRoot,
  "docs/architecture/phase8-agent-node-configuration.md",
);
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup|NodeRegistry)\b/;

describe("PHASE 8 Agent / Node configuration", () => {
  it("AgentDefinition es lógica: sin root, credenciales, MCP, ids", () => {
    const src = readFileSync(DEFINITION, "utf8");
    assert.match(src, /export interface AgentDefinition/);
    assert.match(src, /prompt/);
    assert.match(src, /model/);
    assert.match(src, /toolPolicy/);
    assert.doesNotMatch(src, /AGENT_FILESYSTEM_ROOT|filesystem\.root/);
    assert.doesNotMatch(src, /ANTHROPIC_API_KEY|anthropicApiKey|apiKey/);
    assert.doesNotMatch(src, /HUB_TOKEN|hubToken/);
    assert.doesNotMatch(src, /@modelcontextprotocol|mcp-stdio|Stdio/);
    assert.doesNotMatch(src, /\bnodeId\b|\bworkspaceId\b/);
    // agentId solo en comentarios PHASE 55 (instalación ≠ AgentDefinition.id), no como campo.
    assert.doesNotMatch(src, /readonly agentId/);
    assert.match(src, /readonly id: string/);
    assert.match(src, /readonly name: string/);
    assert.doesNotMatch(src, /dbFile|HUB_PORT/);
  });

  it("GatewayConfig es infraestructura; sin model de Agent", () => {
    const src = readFileSync(GATEWAY_CFG, "utf8");
    assert.match(src, /export type GatewayConfig/);
    assert.match(src, /hubToken/);
    assert.match(src, /dbFile/);
    assert.match(src, /anthropicApiKey/);
    assert.match(src, /maxTokens/);
    assert.doesNotMatch(src, /^\s+model:/m);
    assert.doesNotMatch(src, /readonly model/);
    assert.doesNotMatch(src, /toolPolicy|SYSTEM_PROMPT/);
    assert.doesNotMatch(src, /AGENT_FILESYSTEM_ROOT/);
    assert.doesNotMatch(src, /from ["'].*agent\/definition/);
  });

  it("NodeConfig contiene filesystem; no es AgentDefinition", () => {
    const src = readFileSync(NODE_CFG, "utf8");
    assert.match(src, /export type NodeConfig/);
    assert.match(src, /filesystem/);
    assert.match(src, /AGENT_FILESYSTEM_ROOT/);
    assert.match(src, /loadNodeConfig/);
    assert.doesNotMatch(src, /prompt|toolPolicy|SYSTEM_PROMPT/);
    assert.doesNotMatch(src, /ANTHROPIC_API_KEY|hubToken/);
  });

  it("Runtime usa AgentDefinition; no Node ni MCP ni SQLite ni HTTP", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.match(src, /AgentDefinition/);
    assert.match(src, /createAgentRuntime/);
    assert.doesNotMatch(src, /NodeConfig|loadNodeConfig|AGENT_FILESYSTEM_ROOT/);
    assert.doesNotMatch(src, /@modelcontextprotocol|mcp-stdio/);
    assert.doesNotMatch(src, /better-sqlite3|from ["']hono|from ["']ws["']/);
    assert.doesNotMatch(src, /from ["'].*config\.ts["']/);
  });

  it("un Runtime; producción MCP; sin registries/Capability/A2A/Workspace store", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        assert.doesNotMatch(readFileSync(file, "utf8"), FORBIDDEN, file);
        assert.doesNotMatch(
          readFileSync(file, "utf8"),
          /SingleNodeRuntime|LocalAgentRuntime/,
          file,
        );
      }
    }
    assert.equal(
      walkTs(path.join(repoRoot, "gateway/src/agents")).filter(
        (f) => path.basename(f) === "runtime.ts",
      ).length,
      1,
    );
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/tools/calculator.ts")),
      false,
    );
    assert.match(
      readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8"),
      /attachLocalNode/,
    );
  });

  it("docs: tres configs y modelo vía Definition", () => {
    const doc = readFileSync(PHASE8, "utf8");
    assert.match(doc, /GatewayConfig/);
    assert.match(doc, /AgentDefinition/);
    assert.match(doc, /NodeConfig/);
    assert.match(doc, /filesystem\.root/);
    assert.match(doc, /AgentDefinition\.model/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });
});
