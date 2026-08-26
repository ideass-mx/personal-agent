import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const FORBIDDEN =
  /\b(ActiveWorkspace|activeWorkspaceId|WorkspaceManager|WorkspaceRegistry|ConversationManager|ConversationContext|AgentRegistry|NodeRegistry|A2A)\b/;

describe("PHASE 22 listado Conversation por Workspace", () => {
  it("no mete Workspace en WS, Runtime, AgentTurnInput ni ToolContext", () => {
    const proto = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /workspaceId/);

    const runtime = readFileSync(
      path.join(repoRoot, "hub/src/agent/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtime, /Workspace|workspaceId|listConversationsByWorkspace/);
    const turn = runtime.match(/export interface AgentTurnInput \{[\s\S]*?\n\}/);
    assert.ok(turn);
    assert.doesNotMatch(turn[0], /workspace/i);

    const tools = readFileSync(
      path.join(repoRoot, "hub/src/tools/types.ts"),
      "utf8",
    );
    const ctx = tools.match(/export interface ToolContext \{[\s\S]*?\n\}/);
    assert.ok(ctx);
    assert.doesNotMatch(ctx[0], /workspace/i);

    const sessions = readFileSync(
      path.join(repoRoot, "hub/src/http/sessions.ts"),
      "utf8",
    );
    assert.doesNotMatch(sessions, /workspaceId|Workspace/);

    const http = readFileSync(
      path.join(repoRoot, "hub/src/http/workspace-http.ts"),
      "utf8",
    );
    assert.match(http, /\/workspaces\/:id\/conversations/);
    assert.doesNotMatch(http, FORBIDDEN);

    assert.doesNotMatch(runtime, FORBIDDEN);
    assert.doesNotMatch(tools, /\bagentId\b|\bnodeId\b/);
  });

  it("Android listing no es Active Workspace", () => {
    const src = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/workspace/WorkspaceConversationsCoordinator.kt",
      ),
      "utf8",
    );
    assert.doesNotMatch(src, /activeWorkspaceId|currentWorkspace|selectedWorkspaceGlobal/);
    assert.match(src, /listingWorkspace/);
  });
});
