import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const DOC = path.join(
  repoRoot,
  "docs/architecture/phase23-workspace-conversation-lifecycle.md",
);
const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const HISTORY = path.join(repoRoot, "gateway/src/memory/history.ts");
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const HTTP = path.join(repoRoot, "gateway/src/http/workspace-http.ts");
const TOOLS = path.join(repoRoot, "gateway/src/tools/types.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const SCHEMA = path.join(repoRoot, "db/schema.sql");
const FORBIDDEN =
  /\b(ActiveWorkspace|activeWorkspaceId|WorkspaceManager|ConversationManager|ConversationContext|NodeRegistry)\b/;

describe("PHASE 23 Workspace / Conversation lifecycle (audit)", () => {
  it("docs: AUDIT CLOSED / NO CODE CHANGE; NULL = sin Workspace", () => {
    const doc = readFileSync(DOC, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /Resultado A/);
    assert.match(doc, /sin Workspace/);
    assert.match(doc, /ensureConversation/);
    assert.match(doc, /OpenClaw/);
    assert.match(doc, /ON DELETE SET NULL/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("fronteras: WS, Runtime, Session, ToolContext, schema", () => {
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);

    const runtime = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(runtime, /WorkspaceStore|workspaceId|conversation-workspace/);
    const turn = runtime.match(/export interface AgentTurnInput \{[\s\S]*?\n\}/);
    assert.ok(turn);
    assert.doesNotMatch(turn[0], /workspace/i);
    assert.match(runtime, /memory\.ensureConversation\(input\.conversationId\)/);

    const history = readFileSync(HISTORY, "utf8");
    assert.match(history, /INSERT INTO conversations \(id\) VALUES/);
    assert.doesNotMatch(history, /workspaceId|workspace_id/);

    const ctx = readFileSync(TOOLS, "utf8").match(
      /export interface ToolContext \{[\s\S]*?\n\}/,
    );
    assert.ok(ctx);
    assert.doesNotMatch(ctx[0], /workspace/i);

    const http = readFileSync(HTTP, "utf8");
    assert.match(http, /\/workspaces\/:id\/conversations/);
    assert.match(http, /app\.post\("\/conversations"/);
    assert.doesNotMatch(http, FORBIDDEN);

    const schema = readFileSync(SCHEMA, "utf8");
    assert.match(schema, /ON DELETE SET NULL/);
    assert.doesNotMatch(schema, /active_workspace/);
    assert.doesNotMatch(schema, /CREATE TABLE users/i);

    assert.doesNotMatch(runtime, FORBIDDEN);
  });
});
