/**
 * Prueba crítica: AGENT_READY sin Tailscale, Android ni LLM.
 * No arranca procesos reales de Node; valida contrato SetupState + flags.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-arch-ready-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-arch-ready";
delete process.env.TAILSCALE_AUTHKEY;
process.env.HUB_TOKEN = "c".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "arch.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "33333333-3333-4333-8333-333333333333";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  SetupStates,
  ensureSetupState,
  flagsForSetupState,
  hasProviderApiKeyConfigured,
} = await import("../../src/setup/index.ts");

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("architecture: AGENT_READY without optional deps", () => {
  it("Tailscale absent + Android absent + LLM absent → AGENT_READY", () => {
    assert.equal(hasProviderApiKeyConfigured("anthropic"), false);
    assert.equal(
      fs.existsSync(path.join(tmp, "credentials", "llm", "anthropic.api_key")),
      false,
    );

    const record = ensureSetupState();
    assert.equal(record.state, SetupStates.AGENT_READY);
    assert.equal(record.installationReady, true);
    assert.equal(record.llmConfigured, false);
    assert.equal(record.verified, false);
    assert.equal(record.onboardingCompleted, false);

    const flags = flagsForSetupState(SetupStates.AGENT_READY);
    assert.equal(flags.installationReady, true);
    assert.equal(flags.llmConfigured, false);
    assert.equal(flags.onboardingCompleted, false);
  });
});
