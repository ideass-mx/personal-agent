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

const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const RESOLVE = path.join(
  repoRoot,
  "gateway/src/memory/resolve-workspace-for-conversation.ts",
);
const STORE = path.join(
  repoRoot,
  "gateway/src/workspace/sqlite-workspace-store.ts",
);
const TYPES = path.join(repoRoot, "gateway/src/workspace/types.ts");
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const PHASE14 = path.join(
  repoRoot,
  "docs/architecture/phase14-workspace-context.md",
);
const FORBIDDEN =
  /\b(ActiveWorkspace|activeWorkspaceId|WorkspaceManager|WorkspaceRegistry|WorkspaceRouter|ContextManager|NodeRegistry|CapabilityRegistry)\b/;

describe("PHASE 14 Workspace context resolution", () => {
  it("Runtime no conoce Workspace ni el resolver", () => {
    const src = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(src, /WorkspaceStore|resolveWorkspaceForConversation/);
    assert.doesNotMatch(src, /conversation-workspace|sqlite-workspace-store/);
    assert.doesNotMatch(src, /better-sqlite3/);
  });

  it("resolver pequeño; WorkspaceStore no importa Conversation", () => {
    const resolve = readFileSync(RESOLVE, "utf8");
    assert.match(resolve, /export function resolveWorkspaceForConversation/);
    assert.doesNotMatch(resolve, FORBIDDEN);
    const store = readFileSync(STORE, "utf8");
    assert.doesNotMatch(store, /getConversation|createConversation|conversation-workspace/);
    const types = readFileSync(TYPES, "utf8");
    assert.doesNotMatch(types, /conversationId|ConversationRecord/);
  });

  it("Session y protocolo sin Workspace; sin ActiveWorkspace/agentId/nodeId", () => {
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
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
  });

  it("docs: resolución desde Conversation, FUTURE no implementado", () => {
    const doc = readFileSync(PHASE14, "utf8");
    assert.match(doc, /resolveWorkspaceForConversation/);
    assert.match(doc, /workspace_id/);
    assert.match(doc, /Active Workspace/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });
});
