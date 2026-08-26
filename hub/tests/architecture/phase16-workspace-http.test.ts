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

const PHASE16 = path.join(
  repoRoot,
  "docs/architecture/phase16-workspace-http.md",
);
const HTTP = path.join(repoRoot, "hub/src/http/workspace-http.ts");
const SERVER = path.join(repoRoot, "hub/src/http/server.ts");
const RUNTIME = path.join(repoRoot, "hub/src/agent/runtime.ts");
const WS = path.join(repoRoot, "hub/src/http/ws.ts");
const SESSIONS = path.join(repoRoot, "hub/src/http/sessions.ts");
const TOOL_TYPES = path.join(repoRoot, "hub/src/tools/types.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const FORBIDDEN =
  /\b(ConversationContext|ActiveWorkspace|activeWorkspaceId|WorkspaceManager|WorkspaceContextManager|WorkspaceRegistry|ContextManager|AgentRegistry|NodeRegistry)\b/;

describe("PHASE 16 Workspace HTTP (Gateway)", () => {
  it("docs: consumidor HTTP; Runtime/WS sin Workspace", () => {
    const doc = readFileSync(PHASE16, "utf8");
    assert.match(doc, /CLOSED/);
    assert.match(doc, /\/workspaces/);
    assert.match(doc, /resolveWorkspaceForConversation/);
    assert.match(doc, /Bearer/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("HTTP monta WorkspaceStore; Runtime y protocolo intactos", () => {
    const http = readFileSync(HTTP, "utf8");
    assert.match(http, /export function mountWorkspaceHttp/);
    assert.match(http, /resolveWorkspaceForConversation/);
    assert.match(http, /setConversationWorkspace/);
    assert.doesNotMatch(http, FORBIDDEN);
    assert.match(readFileSync(SERVER, "utf8"), /mountWorkspaceHttp/);
    assert.doesNotMatch(
      readFileSync(RUNTIME, "utf8"),
      /WorkspaceStore|workspace-http|resolveWorkspaceForConversation/,
    );
    assert.doesNotMatch(readFileSync(WS, "utf8"), /workspace-http|mountWorkspaceHttp/);
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);
    assert.doesNotMatch(readFileSync(TOOL_TYPES, "utf8"), /workspaceId|Workspace/);
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
    assert.match(readFileSync(PROTO, "utf8"), /conversationId/);
    for (const dir of [
      path.join(repoRoot, "hub/src"),
      path.join(repoRoot, "agent/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, FORBIDDEN, file);
        assert.doesNotMatch(text, /\bagentId\b/, file);
        assert.doesNotMatch(text, /\bnodeId\b/, file);
      }
    }
    assert.equal(existsSync(PHASE16), true);
  });
});
