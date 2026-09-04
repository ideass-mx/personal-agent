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

describe("PHASE 42 conversation-first tool results UX", () => {
  it("docs PASS; Android presentation only", () => {
    const doc = read(
      "docs/architecture/phase42-conversation-first-tool-results-ux.md",
    );
    assert.match(doc, /PHASE 42 CLOSED/);
    assert.match(doc, /PASS/);
    assert.match(doc, /Architecture changes[\s\S]*NONE/);
  });

  it("ToolActivityUx and ToolResultUx exist; no new protocol frames", () => {
    assert.match(
      read(
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ToolActivityUx.kt",
      ),
      /Preparando acción/,
    );
    assert.match(
      read(
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ToolResultUx.kt",
      ),
      /sanitize|presentInConversation/,
    );
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /PHASE 42/);
    assert.doesNotMatch(proto, /tool_result.*cliente/i);
  });

  it("ChatScreen shows in-thread activity banner", () => {
    const screen = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ChatScreen.kt",
    );
    assert.match(screen, /ToolActivityBanner/);
    assert.match(screen, /ToolResultUx\.presentInConversation/);
    assert.doesNotMatch(screen, /ToolRegistry|CapabilityRegistry|PermissionManager/);
  });

  it("HITL unchanged; recordConfirmResponse wires activity", () => {
    const vm = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConfirmViewModel.kt",
    );
    assert.match(vm, /recordConfirmResponse/);
    assert.match(vm, /sendConfirmResponse/);
    assert.doesNotMatch(
      read("gateway/src/sessions/confirmation-waiter.ts"),
      /PHASE 42/,
    );
  });

  it("Excel Windows copy in activity and results", () => {
    const activity = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ToolActivityUx.kt",
    );
    assert.match(activity, /Windows/);
    const results = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ToolResultUx.kt",
    );
    assert.match(results, /office\.excel/);
  });
});
