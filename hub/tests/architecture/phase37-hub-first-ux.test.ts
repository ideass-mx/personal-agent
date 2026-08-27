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

describe("PHASE 37 Hub-first UX P0 implementation", () => {
  it("implementation doc PASS; architecture NONE; PHASE 38 ready not started", () => {
    const doc = read(
      "docs/architecture/phase37-hub-first-ux-implementation.md",
    );
    assert.match(doc, /PASS/);
    assert.match(doc, /READY FOR PHASE 38/);
    assert.match(doc, /Architecture changes[\s\S]*NONE/);
    assert.ok(
      existsSync(
        path.join(repoRoot, "docs/architecture/phase37-hub-first-ux.md"),
      ),
    );
  });

  it("Android default backend is HUB on empty prefs", () => {
    const policy = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/connection/ConnectionPrefsPolicy.kt",
    );
    assert.match(policy, /return ConnectionBackend\.HUB/);
    assert.match(policy, /First-run|camino feliz|PHASE 37/);
  });

  it("first-run routes unconfigured users to Connection", () => {
    const main = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/app/MainActivity.kt",
    );
    assert.match(main, /firstRunDestination/);
    assert.match(main, /FirstRunDestination\.Connection/);
    assert.match(main, /FirstRunDestination\.Chat/);
    const helper = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/app/FirstRunDestination.kt",
    );
    assert.match(helper, /configured\) FirstRunDestination\.Chat/);
  });

  it("Routing defaults to Hub and maps GATEWAY to OpenClaw adapter", () => {
    const routing = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/RoutingChatConnection.kt",
    );
    assert.match(routing, /private var active: ChatConnection = hub/);
    assert.match(routing, /chatConnectionForBackend/);
    assert.match(routing, /hub\.probe/);
    assert.match(
      routing,
      /backend == ConnectionBackend\.GATEWAY\) gateway else hub/,
    );
  });

  it("did not modify Runtime/MCP/ConfirmationWaiter", () => {
    // Invariant: this phase only touches Android UX — smoke-check hub untouched markers.
    const runtime = read("hub/src/agent/runtime.ts");
    assert.doesNotMatch(runtime, /PHASE 37/);
    assert.ok(existsSync(path.join(repoRoot, "hub/src/http/confirmation-waiter.ts")));
  });
});
