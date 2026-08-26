import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { childEnvForLocalNode } from "../../src/tools/mcp-stdio.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 28 HITL + Node env boundary", () => {
  it("docs CLOSED; HITL y env selectivo", () => {
    const doc = readFileSync(
      path.join(repoRoot, "docs/architecture/phase28-hitl-and-node-boundary.md"),
      "utf8",
    );
    assert.match(doc, /PHASE 28 CLOSED/);
    assert.match(doc, /confirm_request/);
    assert.match(doc, /childEnvForLocalNode/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("Hub Android mapea ConfirmRequest; Node env sin secretos Gateway", () => {
    const hubChat = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt",
      ),
      "utf8",
    );
    assert.match(hubChat, /ServerMessage\.ConfirmRequest/);
    assert.match(hubChat, /sendConfirmResponse/);

    const androidMsg = readFileSync(
      path.join(
        repoRoot,
        "mobile/android/app/src/main/java/mx/ideass/personal/agent/protocol/Messages.kt",
      ),
      "utf8",
    );
    assert.match(androidMsg, /confirm_request/);
    assert.match(androidMsg, /confirm_response/);

    const stdio = readFileSync(
      path.join(repoRoot, "hub/src/tools/mcp-stdio.ts"),
      "utf8",
    );
    assert.match(stdio, /childEnvForLocalNode/);
    assert.doesNotMatch(stdio, /for \(const \[key, value\] of Object\.entries\(process\.env\)\) \{\s*if \(typeof value === "string"\) out\[key\] = value;/);

    const env = childEnvForLocalNode({
      AGENT_FILESYSTEM_ROOT: "/tmp/x",
      HUB_TOKEN: "nope",
      ANTHROPIC_API_KEY: "nope",
    });
    assert.equal(env.AGENT_FILESYSTEM_ROOT, "/tmp/x");
    assert.equal("HUB_TOKEN" in env, false);
    assert.equal("ANTHROPIC_API_KEY" in env, false);
  });
});
