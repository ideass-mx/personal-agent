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
const INDEX = path.join(repoRoot, "gateway/src/index.ts");
const PHASE7 = path.join(repoRoot, "docs/architecture/phase7-single-node.md");
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup|NodeRegistry)\b/;

describe("PHASE 7 Single Node packaging", () => {
  it("un Runtime; sin SingleNodeRuntime ni LocalAgentRuntime", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /SingleNodeRuntime|LocalAgentRuntime/, file);
        assert.doesNotMatch(text, FORBIDDEN, file);
      }
    }
    const runtimes = walkTs(path.join(repoRoot, "gateway/src/agents")).filter(
      (f) => path.basename(f) === "runtime.ts",
    );
    assert.equal(runtimes.length, 1);
  });

  it("Runtime no importa Node lifecycle ni MCP SDK/stdio", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /@modelcontextprotocol/);
    assert.doesNotMatch(src, /mcp-stdio|mcp-executor|attachLocalAgent/);
    assert.doesNotMatch(src, /startLocalAgent/);
    assert.match(src, /createAgentRuntime/);
    assert.match(src, /AgentDefinition/);
    assert.match(src, /TurnMemory/);
    assert.match(src, /LLMProvider/);
    assert.match(src, /AgentRuntimeTools/);
    assert.match(src, /ConfirmationPort/);
  });

  it("AgentDefinition no es Node config; Node no es AgentDefinition", () => {
    const def = readFileSync(DEFINITION, "utf8");
    assert.match(def, /export interface AgentDefinition/);
    assert.doesNotMatch(def, /AGENT_FILESYSTEM_ROOT/);
    assert.doesNotMatch(def, /root\?:/);
    const nodeCfg = readFileSync(
      path.join(repoRoot, "node/src/config.ts"),
      "utf8",
    );
    assert.match(nodeCfg, /AGENT_FILESYSTEM_ROOT/);
    assert.doesNotMatch(nodeCfg, /AgentDefinition/);
    assert.doesNotMatch(nodeCfg, /SYSTEM_PROMPT/);
  });

  it("Gateway compone spawn MCP; producción sin calculator; stdio es el adapter", () => {
    const index = readFileSync(INDEX, "utf8");
    assert.match(index, /attachLocalNode/);
    // PHASE 55: index compone AgentManager → createRuntime (no createAgentRuntime directo).
    assert.match(index, /createDefaultAgentManager/);
    assert.match(index, /agents\.createRuntime|createRuntime\(/);
    assert.doesNotMatch(index, /tools\.register\(/);
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/tools/calculator.ts")),
      false,
    );
    assert.match(
      readFileSync(path.join(repoRoot, "gateway/src/tools/mcp/stdio.ts"), "utf8"),
      /@modelcontextprotocol/,
    );
    assert.match(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
      /"hub":/,
    );
  });

  it("docs: topología, dos procesos, Distributed futuro, sin A2A implementado", () => {
    const doc = readFileSync(PHASE7, "utf8");
    assert.match(doc, /Single Node/);
    assert.match(doc, /npm run hub|npm run dev/);
    assert.match(doc, /stdio/);
    assert.match(doc, /Distributed/);
    assert.match(doc, /Agent Runtime/);
    assert.match(doc, /Local Node/);
    assert.doesNotMatch(doc, /Control Plane/i);
    assert.doesNotMatch(doc, /A2A implementation|implementar A2A/i);
  });
});
