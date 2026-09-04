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

const PHASE20 = path.join(
  repoRoot,
  "docs/architecture/phase20-workspace-continuity.md",
);
const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");
const SESSIONS = path.join(repoRoot, "gateway/src/sessions/index.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const SCHEMA = path.join(repoRoot, "db/schema.sql");
const FORBIDDEN =
  /\b(ActiveWorkspace|activeWorkspaceId|active_workspace_id|UserStore|WorkspaceManager|ConversationContext|WorkspaceContext)\b/;

describe("PHASE 20 Workspace continuity (documental)", () => {
  it("docs: AUDIT CLOSED; decisión A; Session no posee Workspace", () => {
    const doc = readFileSync(PHASE20, "utf8");
    assert.match(doc, /AUDIT CLOSED \/ NO CODE CHANGE/);
    assert.match(doc, /A\) Active Workspace NO es necesario/);
    assert.match(doc, /deviceId/);
    assert.match(doc, /conversationId/);
    assert.match(doc, /earbuds|voz/i);
    assert.match(doc, /multi-device|Multi-device/);
    assert.match(doc, /workspace_id/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("producción: sin Active Workspace, User, workspaceId en WS", () => {
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
    assert.doesNotMatch(readFileSync(SESSIONS, "utf8"), /workspaceId|WorkspaceStore/);
    assert.doesNotMatch(
      readFileSync(RUNTIME, "utf8"),
      /WorkspaceStore|resolveWorkspaceForConversation/,
    );
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
    const schema = readFileSync(SCHEMA, "utf8");
    assert.doesNotMatch(schema, /active_workspace/);
    assert.doesNotMatch(schema, /CREATE TABLE users/i);
    assert.equal(existsSync(PHASE20), true);
  });
});
