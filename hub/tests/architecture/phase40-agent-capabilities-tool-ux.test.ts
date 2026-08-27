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

describe("PHASE 40 agent capabilities / Tool UX (audit)", () => {
  it("docs: CLOSED; READY FOR IMPLEMENTATION; productive NONE; PHASE 41 not started", () => {
    const doc = read(
      "docs/architecture/phase40-agent-capabilities-tool-ux.md",
    );
    assert.match(doc, /PHASE 40 CLOSED/);
    assert.match(doc, /READY FOR IMPLEMENTATION/);
    assert.match(doc, /Productive code changed[\s\S]*NONE|NONE/);
    assert.match(doc, /PHASE 41 NOT STARTED/);
    assert.match(doc, /Architecture Impact[\s\S]*NONE/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("inventory matches DEFAULT_TOOL_POLICY product tools", () => {
    const policy = read("hub/src/tools/tool-policy.ts");
    for (const name of [
      "filesystem.read",
      "filesystem.list",
      "filesystem.write",
      "process.execute",
      "office.excel.read",
      "office.excel.write",
      "agent.echo",
      "customer.demo",
    ]) {
      assert.match(policy, new RegExp(`"${name}"`));
    }
    assert.doesNotMatch(policy, /customer\.test/);
  });

  it("recommends Conversation-first + light Capacidades; no CapabilityRegistry", () => {
    const doc = read(
      "docs/architecture/phase40-agent-capabilities-tool-ux.md",
    );
    assert.match(doc, /Conversation-first|A \+ B ligera/);
    assert.match(doc, /CapabilityRegistry/);
    assert.match(doc, /No.*CapabilityRegistry|sin CapabilityRegistry|CapabilityRegistry.*prohibido/i);
    assert.match(doc, /PermissionManager/);
  });

  it("Android has no tools catalog; HITL shows toolName", () => {
    const host = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConfirmHost.kt",
    );
    assert.match(host, /toolName/);
    const hubChat = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt",
    );
    assert.doesNotMatch(hubChat, /tools\/list|toolNames|ToolCatalog/);
  });

  it("protocol has confirm_request but no client tool_result frame", () => {
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.match(proto, /confirm_request/);
    assert.match(proto, /assistant_chunk/);
    assert.doesNotMatch(
      proto,
      /### `tool_result`[\s\S]{0,40}cliente|type": "tool_result"/,
    );
  });
});
