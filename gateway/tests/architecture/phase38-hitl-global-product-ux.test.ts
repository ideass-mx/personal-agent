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

describe("PHASE 38 HITL global product UX", () => {
  it("docs PASS; no new protocol; no PermissionManager; architecture NONE", () => {
    const doc = read("docs/architecture/phase38-hitl-global-product-ux.md");
    assert.match(doc, /PASS/);
    assert.match(doc, /READY FOR PHASE 39/);
    assert.match(doc, /Architecture changes[\s\S]*NONE/);
    assert.match(doc, /confirm_request/);
    assert.match(doc, /PermissionManager/);
    assert.doesNotMatch(doc, /NEW FRAMES|nuevo protocolo/i);
  });

  it("global host lives above ChatScreen; ChatScreen no longer owns dialog", () => {
    const host = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConfirmHost.kt",
    );
    assert.match(host, /HubConfirmHost/);
    assert.match(host, /HubConfirmViewModel/);
    const main = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/app/MainActivity.kt",
    );
    assert.match(main, /HubConfirmHost\(\)/);
    const chat = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ChatScreen.kt",
    );
    assert.doesNotMatch(chat, /respondHubConfirm|pendingHubConfirm/);
  });

  it("ChatStore keeps RAM pending; countdown UX helper exists", () => {
    const store = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/ChatStore.kt",
    );
    assert.match(store, /pendingHubConfirm/);
    assert.match(store, /receivedAtMs/);
    assert.match(store, /HubConfirmUx\.sanitizeInputSummary/);
    const ux = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConfirmUx.kt",
    );
    assert.match(ux, /TIMEOUT_MS:\s*Long\s*=\s*60_000/);
  });

  it("disconnect clears pending; ConfirmationWaiter untouched", () => {
    const service = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/service/AgentService.kt",
    );
    assert.match(service, /clearPendingHubConfirm/);
    assert.ok(
      existsSync(path.join(repoRoot, "gateway/src/sessions/confirmation-waiter.ts")),
    );
    const waiter = read("gateway/src/sessions/confirmation-waiter.ts");
    assert.doesNotMatch(waiter, /PHASE 38/);
  });
});
