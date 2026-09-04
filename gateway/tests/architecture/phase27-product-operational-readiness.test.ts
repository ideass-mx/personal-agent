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
  "docs/architecture/phase27-product-operational-readiness.md",
);

const SECTIONS = [
  "1. Executive Summary",
  "2. Product Flow Audit",
  "3. Conversation Audit",
  "4. Workspace Audit",
  "5. HTTP Security Audit",
  "6. WebSocket Security Audit",
  "7. MCP Boundary Audit",
  "8. Tool Policy Audit",
  "9. Confirmation Audit",
  "10. Timeout Audit",
  "11. Node Failure Audit",
  "12. Health Audit",
  "13. Shutdown Audit",
  "14. SQLite Audit",
  "15. Android Audit",
  "16. Hub/OpenClaw Audit",
  "17. Packaging Audit",
  "18. Configuration Audit",
  "19. Naming Audit",
  "20. Test Coverage Audit",
  "21. Findings A–G",
  "22. Critical Risks",
  "23. Non-blocking Debt",
  "24. Files Created/Modified",
  "25. Tests",
  "26. Build",
  "27. Smoke",
  "28. Recommendation",
];

describe("PHASE 27 product operational readiness (audit)", () => {
  it("docs: CLOSED; READY WITH DEBT; PHASE 28 not started; 28 sections", () => {
    const doc = readFileSync(DOC, "utf8");
    assert.match(doc, /PHASE 27 CLOSED \/ AUDIT ONLY/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /PHASE 28 NOT STARTED/);
    assert.match(doc, /No productive code was implemented during PHASE 27/);
    for (const heading of SECTIONS) {
      assert.ok(doc.includes(`## ${heading}`), missing(heading));
    }
    assert.doesNotMatch(doc, /Control Plane/i);
  });

    it("invariantes: health público; Workspace auth; SET NULL; Hub mapea confirm; Android recarga Workspace", () => {
    const server = readFileSync(
      path.join(repoRoot, "gateway/src/http/server.ts"),
      "utf8",
    );
    assert.match(server, /app\.get\("\/health"/);
    assert.match(server, /mountWorkspaceHttp/);
    assert.doesNotMatch(server, /\/health[\s\S]{0,200}requireAuth/);

    const http = readFileSync(
      path.join(repoRoot, "gateway/src/http/workspace-http.ts"),
      "utf8",
    );
    assert.match(http, /function requireAuth/);
    assert.match(http, /app\.get\("\/workspaces"/);
    assert.match(http, /app\.post\("\/conversations"/);

    const schema = readFileSync(
      path.join(repoRoot, "db/schema.sql"),
      "utf8",
    );
    assert.match(schema, /ON DELETE SET NULL/);

    const db = readFileSync(
      path.join(repoRoot, "gateway/src/db/database.ts"),
      "utf8",
    );
    assert.match(db, /foreign_keys = ON/);

    const hubChat = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt",
      ),
      "utf8",
    );
    assert.match(hubChat, /ServerMessage\.AssistantDone/);
    assert.match(hubChat, /ServerMessage\.ConfirmRequest/);
    assert.match(hubChat, /sendConfirmResponse/);

    const chatVm = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ChatViewModel.kt",
      ),
      "utf8",
    );
    assert.match(chatVm, /coordinator\.load\(conversationId\)/);

    const index = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    assert.doesNotMatch(index, /\b(NodeRegistry|agentId|PermissionManager)\b/);
  });
});

function missing(heading: string): string {
  return `falta sección ${heading}`;
}
