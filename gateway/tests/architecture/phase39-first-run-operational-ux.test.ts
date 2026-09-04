import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

describe("PHASE 39 first-run operational UX", () => {
  it("docs PASS; architecture NONE; runbook and Quick Start exist", () => {
    const doc = read(
      "docs/architecture/phase39-first-run-operational-ux.md",
    );
    assert.match(doc, /PASS/);
    assert.match(doc, /READY FOR PHASE 40/);
    assert.match(doc, /Architecture changes[\s\S]*NONE/);
    assert.ok(existsSync(path.join(repoRoot, "docs/runbook.md")));
    const readme = read("README.md");
    assert.match(readme, /Quick Start/);
    assert.match(readme, /AGENT_FILESYSTEM_ROOT/);
  });

  it("OperationalCopy and History hydration exist on Android", () => {
    assert.match(
      read(
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/OperationalCopy.kt",
      ),
      /agent_disconnected/,
    );
    assert.match(
      read(
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConversationHistorySync.kt",
      ),
      /HistoryHydrationStatus/,
    );
    assert.match(
      read(
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ChatScreen.kt",
      ),
      /chatEmptyTitle|historyLoading|Nueva conversación/,
    );
  });

  it("FS root remains optional in agent config (no architecture break)", () => {
    const cfg = read("node/src/config.ts");
    assert.match(cfg, /if \(root\.length === 0\) return \{\}/);
    const env = read("gateway/.env.example");
    assert.match(env, /AGENT_FILESYSTEM_ROOT/);
    assert.match(env, /recomendad/i);
  });

  it("did not modify Runtime or ConfirmationWaiter", () => {
    assert.doesNotMatch(read("gateway/src/agents/runtime.ts"), /PHASE 39/);
    assert.doesNotMatch(
      read("gateway/src/sessions/confirmation-waiter.ts"),
      /PHASE 39/,
    );
  });
});
