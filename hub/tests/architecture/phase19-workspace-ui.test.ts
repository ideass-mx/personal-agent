import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "build") continue;
      walk(full, files);
      continue;
    }
    if (name.endsWith(".kt") || name.endsWith(".ts") || name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

const PHASE19 = path.join(repoRoot, "docs/architecture/phase19-workspace-ui.md");
const PROTO = path.join(repoRoot, "packages/protocol/messages.ts");
const RUNTIME = path.join(repoRoot, "hub/src/agent/runtime.ts");
const WS = path.join(repoRoot, "hub/src/http/ws.ts");
const ANDROID_WS = path.join(
  repoRoot,
  "mobile/android/app/src/main/java/mx/ideass/personal/agent/workspace",
);

describe("PHASE 19 Workspace UI", () => {
  it("docs y fronteras", () => {
    const doc = readFileSync(PHASE19, "utf8");
    assert.match(doc, /CLOSED/);
    assert.match(doc, /conversationWorkspace/);
    assert.match(doc, /Sin Workspace/);
    assert.match(doc, /ChatScreen/);
    assert.doesNotMatch(doc, /\bactiveWorkspaceId\b/);
  });

  it("Android workspace: sin Active Workspace; Runtime/WS intactos", () => {
    assert.equal(existsSync(ANDROID_WS), true);
    for (const file of walk(ANDROID_WS)) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\bactiveWorkspaceId\b/, file);
      assert.doesNotMatch(text, /\bactiveWorkspace\b/, file);
      assert.doesNotMatch(text, /user_message/, file);
    }
    assert.doesNotMatch(readFileSync(RUNTIME, "utf8"), /WorkspaceStore|workspace-http/);
    assert.doesNotMatch(readFileSync(WS, "utf8"), /workspace-http|WorkspaceHttp/);
    assert.doesNotMatch(readFileSync(PROTO, "utf8"), /workspaceId/);
  });
});
