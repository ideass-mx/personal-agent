import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 21 creación explícita de Conversation", () => {
  it("user_message y Session sin workspaceId; Runtime sin Workspace", () => {
    const proto = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.doesNotMatch(proto, /workspaceId/);
    const userMsg = /UserMessage[\s\S]*?}\);/;
    const match = proto.match(userMsg);
    assert.ok(match);
    assert.doesNotMatch(match[0], /workspaceId/);

    const ws = readFileSync(path.join(repoRoot, "gateway/src/ws/index.ts"), "utf8");
    assert.doesNotMatch(ws, /workspaceId/);
    const sessions = readFileSync(
      path.join(repoRoot, "gateway/src/sessions/index.ts"),
      "utf8",
    );
    assert.doesNotMatch(sessions, /workspaceId|Workspace/);

    const runtime = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtime, /Workspace|workspaceId|createConversation/);

    const http = readFileSync(
      path.join(repoRoot, "gateway/src/http/workspace-http.ts"),
      "utf8",
    );
    assert.match(http, /app\.post\("\/conversations"/);
    assert.doesNotMatch(http, /activeWorkspaceId/);
  });

  it("Android no introduce Active Workspace", () => {
    const vm = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/SessionsViewModel.kt",
      ),
      "utf8",
    );
    assert.doesNotMatch(vm, /activeWorkspaceId|currentWorkspace|selectedWorkspaceGlobal/);
    assert.match(vm, /hubCasualConversation/);
    assert.match(vm, /hubConversationInWorkspace/);
  });
});
