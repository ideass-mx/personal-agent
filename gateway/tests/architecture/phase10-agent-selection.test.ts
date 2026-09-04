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

const PHASE10 = path.join(
  repoRoot,
  "docs/architecture/phase10-agent-selection.md",
);
const FORBIDDEN =
  /\b(AgentSelector|AgentRouter|NodeRegistry)\b/;

describe("PHASE 10 Agent selection (documental)", () => {
  it("docs: auditoría, un Agent de proceso, sin implementar selección", () => {
    const doc = readFileSync(PHASE10, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /conversationId/);
    assert.match(doc, /Session/);
    assert.match(doc, /Workspace/);
    assert.match(doc, /MCP/);
    assert.match(doc, /A2A/);
    assert.match(doc, /Recommended model|Modelo recomendado/i);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("producción y protocolo sin selector, registry ni agentId", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, FORBIDDEN, file);
        const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
        // agentId = identidad canónica del producto (PHASE 51b/53), no selector multi-agent.
        if (
          rel.endsWith("config.ts") ||
          rel.endsWith("http/server.ts") ||
          rel.includes("/pairing/") ||
          rel.includes("pairing-http") ||
          rel.includes("agents/definition") ||
          rel.includes("agents/registry") ||
          rel.includes("agents/manager")
        ) {
          continue;
        }
        assert.doesNotMatch(text, /\bagentId\b/, file);
      }
    }
    const proto = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /\bagentId\b/);
    assert.doesNotMatch(proto, /workspaceId/);
    assert.match(proto, /conversationId/);
    assert.equal(existsSync(PHASE10), true);
  });
});
