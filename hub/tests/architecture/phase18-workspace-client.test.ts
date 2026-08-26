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

const PHASE18 = path.join(
  repoRoot,
  "docs/architecture/phase18-workspace-client.md",
);
const CLIENT = path.join(
  repoRoot,
  "packages/workspace-http/src/client.ts",
);
const RUNTIME = path.join(repoRoot, "hub/src/agent/runtime.ts");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const FORBIDDEN =
  /\b(ActiveWorkspace|activeWorkspaceId|getActiveWorkspace|setActiveWorkspace|WorkspaceRegistry|AgentRegistry|NodeRegistry|ConversationContext|UserStore)\b/;

describe("PHASE 18 Workspace HTTP client", () => {
  it("docs: cliente HTTP; sin Active Workspace ni WS workspaceId", () => {
    const doc = readFileSync(PHASE18, "utf8");
    assert.match(doc, /CLOSED/);
    assert.match(doc, /@mxideass\/workspace-http/);
    assert.match(doc, /createWorkspaceHttpClient/);
    assert.match(doc, /Bearer/);
    assert.match(doc, /null/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("cliente no importa Runtime; protocolo sin workspaceId", () => {
    const client = readFileSync(CLIENT, "utf8");
    assert.match(client, /export function createWorkspaceHttpClient/);
    assert.doesNotMatch(client, /user_message/);
    assert.doesNotMatch(client, /from ["'].*agent\/runtime/);
    assert.doesNotMatch(client, FORBIDDEN);
    assert.doesNotMatch(
      readFileSync(RUNTIME, "utf8"),
      /workspace-http|createWorkspaceHttpClient/,
    );
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
    for (const file of walkTs(path.join(repoRoot, "packages/workspace-http/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, FORBIDDEN, file);
      assert.doesNotMatch(text, /\bagentId\b/, file);
      assert.doesNotMatch(text, /\bnodeId\b/, file);
    }
    assert.equal(existsSync(PHASE18), true);
  });
});
