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

describe("PHASE 41 agent capabilities UX implementation", () => {
  it("docs PASS; Android UX only; no CapabilityRegistry", () => {
    const doc = read(
      "docs/architecture/phase41-agent-capabilities-ux-implementation.md",
    );
    assert.match(doc, /PHASE 41 CLOSED/);
    assert.match(doc, /PASS/);
    assert.match(doc, /Architecture changes[\s\S]*NONE/);
    assert.match(doc, /AgentCapabilityUx/);
    assert.match(doc, /Sin CapabilityRegistry|no CapabilityRegistry|sin registry/i);
  });

  it("AgentCapabilityUx maps MVP tools with human labels", () => {
    const ux = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/capabilities/AgentCapabilityUx.kt",
    );
    for (const [tool, label] of [
      ["filesystem.read", "Leer archivos"],
      ["filesystem.write", "Escribir archivos"],
      ["process.execute", "Ejecutar comandos"],
      ["office.excel.read", "Leer Excel"],
      ["office.excel.write", "Modificar Excel"],
    ]) {
      assert.match(ux, new RegExp(`toolName = "${tool}"`));
      assert.match(ux, new RegExp(`label = "${label}"`));
    }
    for (const hidden of [
      "agent.echo",
      "math.add",
      "diagnostics.ping",
      "system.info",
      "customer.demo",
    ]) {
      assert.match(ux, new RegExp(`"${hidden}"`));
    }
  });

  it("Capabilities screen reachable from Settings without connection API", () => {
    const settings = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/settings/SettingsScreen.kt",
    );
    assert.match(settings, /onOpenCapabilities/);
    assert.match(settings, /settings_section_capabilities/);
    const main = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/app/MainActivity.kt",
    );
    assert.match(main, /Routes\.Capabilities/);
    assert.match(main, /CapabilitiesScreen/);
    const screen = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/capabilities/CapabilitiesScreen.kt",
    );
    assert.match(screen, /AgentCapabilityUx\.mvpCapabilities/);
    assert.doesNotMatch(screen, /tools\/list|ChatConnection|toolNames/i);
  });

  it("HITL uses human labels via AgentCapabilityUx", () => {
    const host = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConfirmHost.kt",
    );
    assert.match(host, /AgentCapabilityUx/);
    assert.match(host, /hub_confirm_capability/);
    assert.doesNotMatch(host, /hub_confirm_tool/);
  });

  it("did not modify Runtime, ConfirmationWaiter, or protocol", () => {
    assert.doesNotMatch(read("gateway/src/agents/runtime.ts"), /PHASE 41/);
    assert.doesNotMatch(
      read("gateway/src/sessions/confirmation-waiter.ts"),
      /PHASE 41/,
    );
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /PHASE 41/);
    assert.match(proto, /confirm_request/);
  });
});
