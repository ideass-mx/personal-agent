import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowsProductAgentId,
  allowsUserContextNodeIdField,
} from "./product-agent-id-allowlist.ts";

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
const TURN = path.join(repoRoot, "gateway/src/memory/types.ts");
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const NODE_CFG = path.join(repoRoot, "node/src/config.ts");
const MCP_STDIO = path.join(repoRoot, "gateway/src/tools/mcp/stdio.ts");
const PHASE13 = path.join(
  repoRoot,
  "docs/architecture/phase13-conversation-workspace.md",
);
const FORBIDDEN =
  /\b(CapabilityRegistry|WorkspaceManager|ContextManager|ConversationWorkspaceManager|NodeRegistry|ActiveWorkspace|WorkspaceRegistry)\b/;

describe("PHASE 13 Conversation / Workspace association", () => {
  it("Runtime y TurnMemory no conocen Workspace", () => {
    const runtime = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(runtime, /WorkspaceStore|workspaceId|conversation-workspace/);
    assert.doesNotMatch(runtime, /better-sqlite3/);
    const turn = readFileSync(TURN, "utf8");
    assert.match(turn, /export interface TurnMemory/);
    assert.doesNotMatch(turn, /workspaceId|WorkspaceStore/);
  });

  it("Session y Node y MCP no persisten Workspace", () => {
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);
    assert.doesNotMatch(readFileSync(NODE_CFG, "utf8"), /workspaceId|WorkspaceStore/);
    assert.doesNotMatch(readFileSync(MCP_STDIO, "utf8"), /WorkspaceStore|workspace_id/);
  });

  it("sin registries, agentId, nodeId, Capability*; protocolo sin workspaceId", () => {
    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, FORBIDDEN, file);
        const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
        if (allowsProductAgentId(rel)) {
          if (!allowsUserContextNodeIdField(rel)) {
            assert.doesNotMatch(text, /\bnodeId\b/, file);
          }
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
  });

  it("docs: workspace_id nullable, ON DELETE SET NULL, sin protocolo", () => {
    const doc = readFileSync(PHASE13, "utf8");
    assert.match(doc, /workspace_id/);
    assert.match(doc, /SET NULL|nullable/i);
    assert.match(doc, /ON DELETE SET NULL/);
    assert.doesNotMatch(doc, /Control Plane/i);
    assert.equal(
      existsSync(path.join(repoRoot, "db/migrations/003_conversation_workspace.sql")),
      true,
    );
  });
});
