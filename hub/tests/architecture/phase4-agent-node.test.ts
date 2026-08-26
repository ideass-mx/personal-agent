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
const PHASE4 = path.join(repoRoot, "docs/architecture/phase4-agent-node.md");
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup|NodeRegistry|AgentRegistry)\b/;

describe("PHASE 4 Agent / Node topology", () => {
  it("Runtime no importa Node, MCP SDK ni implementaciones de Tools", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /@modelcontextprotocol/);
    assert.doesNotMatch(src, /mcp-stdio|mcp-executor|attachLocalAgent/);
    assert.doesNotMatch(src, /from ["'].*agent\/src/);
    assert.doesNotMatch(src, /lifecycle|excel-com|filesystem-read/);
    assert.doesNotMatch(src, /nodeId|agentId/);
    assert.doesNotMatch(src, /if \(.*=== ["']writer/);
    assert.doesNotMatch(src, /BookWriterRuntime|ResearchRuntime/);
  });

  it("no hay agentId/nodeId/fleet en código de producción Hub+Agent", () => {
    for (const dir of [
      path.join(repoRoot, "hub/src"),
      path.join(repoRoot, "agent/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /\bagentId\b/, file);
        assert.doesNotMatch(text, /\bnodeId\b/, file);
        assert.doesNotMatch(text, FORBIDDEN, file);
      }
    }
  });

  it("sin calculator in-process; MCP adapter fuera del Runtime", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "hub/src/tools/calculator.ts")),
      false,
    );
    const stdio = readFileSync(
      path.join(repoRoot, "hub/src/tools/mcp-stdio.ts"),
      "utf8",
    );
    assert.match(stdio, /@modelcontextprotocol/);
    assert.doesNotMatch(readFileSync(RUNTIME, "utf8"), /@modelcontextprotocol/);
  });

  it("docs: Agent implícito, Node ≠ Agent, topologías, A2A y Workspace aplazados", () => {
    const doc = readFileSync(PHASE4, "utf8");
    assert.match(doc, /identidad es \*\*implícita\*\*|Agent identity is currently implicit/i);
    assert.match(doc, /Local Node/);
    assert.match(doc, /Node ≠ Agent|no es Agent/i);
    assert.match(doc, /Single Node/);
    assert.match(doc, /Distributed/);
    assert.match(doc, /A2A = Agent → Agent|A2A = Agent/);
    assert.match(doc, /Workspace/);
    assert.doesNotMatch(doc, /\bCapabilityRegistry\b/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });
});
