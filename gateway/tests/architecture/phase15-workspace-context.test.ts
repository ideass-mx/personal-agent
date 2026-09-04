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

const PHASE15 = path.join(
  repoRoot,
  "docs/architecture/phase15-workspace-context.md",
);
const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const WS = path.join(repoRoot, "gateway/src/ws/index.ts");
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const TOOL_TYPES = path.join(repoRoot, "gateway/src/tools/types.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const FORBIDDEN =
  /\b(ConversationContext|ActiveWorkspace|activeWorkspaceId|WorkspaceManager|WorkspaceContextManager|WorkspaceRegistry|ContextManager|NodeRegistry)\b/;

describe("PHASE 15 Workspace context (documental)", () => {
  it("docs: AUDIT CLOSED; sin ConversationContext", () => {
    const doc = readFileSync(PHASE15, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /ConversationContext/);
    assert.match(doc, /no se crea|No se crea/i);
    assert.match(doc, /resolveWorkspaceForConversation/);
    assert.match(doc, /workspace_id/);
    assert.match(doc, /Active Workspace/);
    assert.match(doc, /PHASE 16/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("producción: sin ConversationContext; Runtime/WS/Session/MCP intactos", () => {
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
    const runtime = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(runtime, /WorkspaceStore|resolveWorkspaceForConversation/);
    assert.match(readFileSync(WS, "utf8"), /runTurn\(/);
    assert.doesNotMatch(readFileSync(WS, "utf8"), /resolveWorkspaceForConversation/);
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);
    const toolCtx = readFileSync(TOOL_TYPES, "utf8");
    assert.match(toolCtx, /interface ToolContext/);
    assert.doesNotMatch(toolCtx, /workspaceId|Workspace/);
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
    assert.equal(existsSync(PHASE15), true);
  });
});
