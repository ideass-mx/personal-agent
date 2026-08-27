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

describe("PHASE 34 product operational completeness (audit)", () => {
  it("docs: CLOSED; READY WITH DEBT; PHASE 35 closed; PHASE 36 not started", () => {
    const doc = read(
      "docs/architecture/phase34-product-operational-completeness-audit.md",
    );
    assert.match(doc, /PHASE 34 CLOSED/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /PHASE 35 CLOSED/);
    assert.match(doc, /PHASE 36 NOT STARTED/);
    assert.match(doc, /agentReady|health snapshot|E-34-05/i);
    assert.match(doc, /\*\*B:\*\* ninguno/);
    assert.match(doc, /\*\*C:\*\* ninguno/);
    assert.doesNotMatch(doc, /Control Plane/i);
  });

  it("startup: attachLocalAgent antes de READY; fail exit 1", () => {
    const index = read("hub/src/index.ts");
    assert.match(index, /attachLocalAgent/);
    assert.match(index, /\[hub\] READY/);
    assert.match(index, /process\.exit\(1\)/);
    assert.match(index, /SIGINT|SIGTERM/);
    assert.match(index, /http\.close/);
    assert.match(index, /agent\.shutdown/);
  });

  it("config: ANTHROPIC y HUB_TOKEN required; filesystem root opcional", () => {
    const config = read("hub/src/config.ts");
    assert.match(config, /ANTHROPIC_API_KEY/);
    assert.match(config, /HUB_TOKEN/);
    const envEx = read("hub/.env.example");
    assert.match(envEx, /AGENT_FILESYSTEM_ROOT/);
    const nodeCfg = read("agent/src/config.ts");
    assert.match(nodeCfg, /if \(root\.length === 0\) return \{\}/);
  });

  it("health es snapshot de boot; packaging smoke existe", () => {
    const server = read("hub/src/http/server.ts");
    assert.match(server, /agentReady: extras\?\.agentReady/);
    assert.match(server, /agentTools: extras\?\.agentTools/);
    assert.ok(existsSync(path.join(repoRoot, "scripts/smoke-package.mjs")));
    assert.ok(existsSync(path.join(repoRoot, "scripts/package.mjs")));
  });

  it("sin Docker/CI; sin User/supervisor en índice Hub", () => {
    assert.equal(existsSync(path.join(repoRoot, "Dockerfile")), false);
    assert.equal(existsSync(path.join(repoRoot, ".github/workflows")), false);
    const index = read("hub/src/index.ts");
    assert.doesNotMatch(index, /respawn|supervisor|heartbeat|UserService/i);
  });

  it("Android HITL y History sync presentes (ops mínimas)", () => {
    const host = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConfirmHost.kt",
    );
    assert.match(host, /HubConfirmHost|hub_confirm/i);
    const sync = read(
      "mobile/android/app/src/main/java/mx/ideass/personal/agent/chat/HubConversationHistorySync.kt",
    );
    assert.match(sync, /getConversationMessages/);
  });
});
