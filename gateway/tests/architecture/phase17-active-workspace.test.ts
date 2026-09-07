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

const PHASE17 = path.join(
  repoRoot,
  "docs/architecture/phase17-active-workspace.md",
);
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const SCHEMA = path.join(repoRoot, "db/schema.sql");
const FORBIDDEN =
  /\b(ActiveWorkspace|activeWorkspaceId|active_workspace_id|WorkspaceManager|ActiveWorkspaceManager|ConversationContext|ContextManager|NodeRegistry)\b/;

describe("PHASE 17 Active Workspace (documental)", () => {
  it("docs: AUDIT CLOSED; dueño User; Session no posee Active", () => {
    const doc = readFileSync(PHASE17, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /Dueño conceptual/);
    assert.match(doc, /Session/);
    assert.match(doc, /deviceId/);
    assert.match(doc, /Conversation Workspace/);
    assert.match(doc, /casual/i);
    assert.match(doc, /precedencia/i);
    assert.match(doc, /multi-device|varios `deviceId`/i);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("producción: sin Active Workspace; schema y protocolo intactos", () => {
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
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);
    assert.doesNotMatch(
      readFileSync(RUNTIME, "utf8"),
      /WorkspaceStore|resolveWorkspaceForConversation/,
    );
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
    const schema = readFileSync(SCHEMA, "utf8");
    assert.doesNotMatch(schema, /active_workspace/);
    // User local (PHASE 57.2) vive en migraciones, no como Active Workspace.
    const identityMig = readFileSync(
      path.join(repoRoot, "db/migrations/009_identity_foundation.sql"),
      "utf8",
    );
    assert.match(identityMig, /CREATE TABLE users/);
    assert.equal(existsSync(PHASE17), true);
  });
});
