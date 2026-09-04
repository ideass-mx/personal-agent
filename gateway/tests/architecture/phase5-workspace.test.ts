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
const PHASE5 = path.join(repoRoot, "docs/architecture/phase5-workspace.md");
const TERMINOLOGY = path.join(repoRoot, "docs/architecture/terminology.md");
const FORBIDDEN =
  /\b(CapabilityRegistry|CapabilityManager|CapabilityProvider|CapabilityCatalog|ToolLookup|NodeRegistry)\b/;

describe("PHASE 5 Workspace boundary", () => {
  it("Workspace no está definido en runtime.ts; Runtime no importa storage ni SQLite", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /\bWorkspace\b/);
    assert.doesNotMatch(src, /\bWorkspaceStore\b/);
    assert.doesNotMatch(src, /sqlite-turn-memory|memory\/history/);
    assert.doesNotMatch(src, /better-sqlite3/);
    assert.doesNotMatch(src, /createWorkspace|loadWorkspace|saveWorkspace/);
  });

  it("Runtime no importa Workspace; registries prohibidos siguen fuera", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, FORBIDDEN, file);
      }
    }
  });

  it("docs: Conversation ≠ Workspace; sin Project/Capability; MCP y A2A", () => {
    const doc = readFileSync(PHASE5, "utf8");
    const terms = readFileSync(TERMINOLOGY, "utf8");
    assert.match(doc, /Conversation ≠ Workspace|Conversation y Workspace/);
    assert.match(doc, /TurnMemory/);
    assert.match(doc, /MCP/);
    assert.match(doc, /Agent → Tool/);
    assert.match(doc, /A2A/);
    assert.match(doc, /Agent → Agent|Agent ── A2A/);
    assert.match(doc, /no es dueño|no es Workspace manager/i);
    assert.doesNotMatch(doc, /^## Project/m);
    assert.doesNotMatch(doc, /\bCapabilityRegistry\b/);
    assert.doesNotMatch(doc, /class interface /);
    assert.doesNotMatch(doc, /class NodeRegistry|interface NodeRegistry/);
    assert.doesNotMatch(doc, /Control Plane/i);
    assert.match(terms, /\*\*Workspace\*\*/);
    assert.match(terms, /\*\*Conversation\*\*/);
    assert.doesNotMatch(terms, /\| \*\*Project\*\*/);
    assert.doesNotMatch(terms, /\| \*\*Capability\*\*/);
  });

  it("protocolo WS no transporta workspaceId", () => {
    const proto = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /workspaceId/);
  });
});
