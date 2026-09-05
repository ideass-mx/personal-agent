import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 32 conversation recovery + stream routing", () => {
  it("docs: CLOSED WITH DEBT; History API + routing; PHASE 33 closed", () => {
    const doc = read(
      "docs/architecture/phase32-conversation-recovery-and-stream-routing.md",
    );
    assert.match(doc, /PHASE 32 CLOSED/);
    assert.match(doc, /CLOSED WITH DEBT/);
    assert.match(doc, /PHASE 33 CLOSED/);
    assert.match(doc, /PHASE 34 (CLOSED|NOT STARTED)/);
    assert.match(doc, /GET \/conversations\/:conversationId\/messages|GET \/conversations\/:id\/messages/);
    assert.match(doc, /assistant_chunk/);
    assert.match(doc, /E-31-05/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("History API: listConversationMessages + HTTP route; no tool roles", () => {
    const history = read("gateway/src/memory/history.ts");
    assert.match(history, /export function listConversationMessages/);
    assert.match(history, /ORDER BY created_at ASC, id ASC/);

    const http = read("gateway/src/http/workspace-http.ts");
    assert.match(http, /app\.get\("\/conversations\/:id\/messages"/);
    assert.match(http, /listConversationMessages/);
    assert.match(http, /not_found.*Conversation inexistente/);

    const schema = read("db/schema.sql");
    assert.match(schema, /role IN \('user', 'assistant'\)/);
  });

  it("workspace-http client: getConversationMessages", () => {
    const client = read("packages/workspace-http/src/client.ts");
    assert.match(client, /getConversationMessages/);
    assert.match(client, /\/conversations\/\$\{.*\}\/messages/);
  });

  it("WS: un solo ensureConversation; chunk/error llevan conversationId", () => {
    const ws = read("gateway/src/ws/index.ts");
    assert.match(ws, /const conversationId = ensureConversation\(msg\.conversationId\)/);
    assert.match(ws, /conversationId,\s*$/m);
    assert.match(
      ws,
      /type: "assistant_chunk"[\s\S]*conversationId/,
    );
    assert.match(ws, /type: "error"[\s\S]*conversationId/);
    // No pasar msg.conversationId crudo al Runtime (evitar mint doble).
    assert.doesNotMatch(
      ws,
      /runTurn\(\{\s*conversationId:\s*msg\.conversationId/,
    );
  });

  it("protocolo aditivo: conversationId opcional en chunk/error", () => {
    const protocol = read("packages/protocol/messages.ts");
    assert.match(
      protocol,
      /type: "assistant_chunk"; text: string; conversationId\?: string/,
    );
    assert.match(
      protocol,
      /type: "error";[\s\S]*code: ErrorCode;[\s\S]*message: string;[\s\S]*conversationId\?: string/,
    );

    const md = read("packages/protocol/PROTOCOL.md");
    assert.match(md, /assistant_chunk[\s\S]*conversationId/);
  });

  it("Android Hub: routing por conversationId; History sync replaceThread", () => {
    const hubChat = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt",
    );
    assert.match(hubChat, /sessionKey = msg\.conversationId/);

    const sync = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConversationHistorySync.kt",
    );
    assert.match(sync, /getConversationMessages/);
    assert.match(sync, /replaceThread/);
    assert.match(sync, /hasAssistantWork/);

    const service = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/service/AgentService.kt",
    );
    assert.match(service, /hubConversationHistorySync\.start\(\)/);
  });

  it("invariantes: Runtime/AgentTurnInput/ToolContext/MCP sin cambios de fase", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.match(runtime, /export interface AgentTurnInput/);
    assert.doesNotMatch(runtime, /workspaceId/);
    assert.doesNotMatch(runtime, /listConversationMessages/);

    const tools = read("gateway/src/tools/types.ts");
    assert.match(tools, /ToolContext/);
    assert.doesNotMatch(tools, /workspaceId/);
  });
});
