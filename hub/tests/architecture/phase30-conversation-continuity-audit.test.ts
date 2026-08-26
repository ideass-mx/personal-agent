import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 30 conversation continuity (audit)", () => {
  it("docs: CLOSED; READY WITH DEBT; PHASE 31 not started", () => {
    const doc = readFileSync(
      path.join(
        repoRoot,
        "docs/architecture/phase30-conversation-continuity-audit.md",
      ),
      "utf8",
    );
    assert.match(doc, /PHASE 30 CLOSED/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /PHASE 31 CLOSED/);
    assert.match(doc, /D-30-01|cross-talk/i);
    assert.match(doc, /D-27-03|History API/i);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("ensureConversation: reutiliza id existente o INSERT id arbitrario sin pisar workspace", () => {
    const history = readFileSync(
      path.join(repoRoot, "hub/src/memory/history.ts"),
      "utf8",
    );
    assert.match(history, /INSERT INTO conversations \(id\) VALUES \(\?\)/);
    assert.match(
      history,
      /Si el cliente envía conversationId, se reutiliza/,
    );
    const workspaceHttp = readFileSync(
      path.join(repoRoot, "hub/src/http/workspace-http.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      workspaceHttp,
      /ensureConversation/,
      "Workspace HTTP no debe crear vía ensureConversation",
    );
  });

  it("messages SQLite: solo roles user y assistant; runtime persiste user al inicio", () => {
    const schema = readFileSync(
      path.join(repoRoot, "db/schema.sql"),
      "utf8",
    );
    assert.match(schema, /role.*CHECK \(role IN \('user', 'assistant'\)\)/);
    const runtime = readFileSync(
      path.join(repoRoot, "hub/src/agent/runtime.ts"),
      "utf8",
    );
    assert.match(
      runtime,
      /memory\.addMessage\(\s*conversationId,\s*"user"/,
    );
    assert.match(
      runtime,
      /memory\.addMessage\(\s*conversationId,\s*"assistant"/,
    );
    assert.doesNotMatch(runtime, /addMessage\([^)]*"tool/);
  });

  it("GET HTTP messages (PHASE 32); confirmación solo RAM", () => {
    const workspaceHttp = readFileSync(
      path.join(repoRoot, "hub/src/http/workspace-http.ts"),
      "utf8",
    );
    assert.match(workspaceHttp, /\/conversations\/:id\/messages/);
    assert.match(workspaceHttp, /listConversationMessages/);
    const waiter = readFileSync(
      path.join(repoRoot, "hub/src/http/confirmation-waiter.ts"),
      "utf8",
    );
    assert.match(waiter, /Estado solo en memoria/);
    assert.doesNotMatch(waiter, /db\.prepare|INSERT INTO messages/);
  });

  it("WS Hub: session.replying serializa; chunks carry conversationId", () => {
    const ws = readFileSync(
      path.join(repoRoot, "hub/src/http/ws.ts"),
      "utf8",
    );
    assert.match(ws, /session\.replying/);
    assert.match(ws, /code: "busy"/);
    const protocol = readFileSync(
      path.join(repoRoot, "packages/protocol/messages.ts"),
      "utf8",
    );
    assert.match(ws, /conversationId/);
  });

  it("Android Hub: assistant_done y chunk enrutan por conversationId", () => {
    const hubChat = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt",
      ),
      "utf8",
    );
    assert.match(hubChat, /AssistantDone\(msg\.conversationId\)/);
    assert.match(hubChat, /sessionKey = msg\.conversationId/);
    const chatStore = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ChatStore.kt",
      ),
      "utf8",
    );
    assert.match(chatStore, /HubConfirmPending/);
    assert.match(chatStore, /no se persiste/);
  });
});
