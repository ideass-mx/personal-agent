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

const PHASE11 = path.join(
  repoRoot,
  "docs/architecture/phase11-interaction-workspace.md",
);
const FORBIDDEN_PROD =
  /\b(WorkspaceManager|ContextManager|ProjectManager|NodeRegistry|AgentSelector)\b/;

describe("PHASE 11 Interaction & Workspace (documental)", () => {
  it("docs: Session ≠ Conversation ≠ Workspace; sin Context entidad", () => {
    const doc = readFileSync(PHASE11, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /Session ≠ Conversation/);
    assert.match(doc, /Conversation ≠ Workspace|Conversation.*Workspace/);
    assert.match(doc, /Workspace ≠ Agent|Agent ≠ Workspace/);
    assert.match(doc, /CASUAL|Casual/);
    assert.match(doc, /Active Workspace/);
    assert.match(doc, /earbuds|voz/i);
    assert.match(doc, /MCP/);
    assert.match(doc, /A2A/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("producción: sin WorkspaceManager ni workspaceId en protocolo", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        assert.doesNotMatch(readFileSync(file, "utf8"), FORBIDDEN_PROD, file);
      }
    }
    const proto = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /workspaceId/);
    assert.match(proto, /conversationId/);
    assert.equal(existsSync(PHASE11), true);
  });
});
