/**
 * Fase 2 onboarding refactor — SetupState store + HTTP status API.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-setup-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "a".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_ID = "11111111-1111-4111-8111-111111111111";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  SetupStates,
  canTransitionSetupState,
  flagsForSetupState,
  ensureSetupState,
  getSetupState,
  transitionSetupState,
  replaceSetupStateForTests,
  readSetupState,
  toSetupStatusDto,
} = await import("../../src/setup/index.ts");

const { mountSetupHttp } = await import("../../src/http/setup-http.ts");

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("SetupState flags + transitions", () => {
  it("flagsForSetupState AGENT_READY", () => {
    const f = flagsForSetupState(SetupStates.AGENT_READY);
    assert.equal(f.installationReady, true);
    assert.equal(f.llmConfigured, false);
    assert.equal(f.verified, false);
    assert.equal(f.onboardingCompleted, false);
  });

  it("flagsForSetupState READY", () => {
    const f = flagsForSetupState(SetupStates.READY);
    assert.equal(f.installationReady, true);
    assert.equal(f.llmConfigured, true);
    assert.equal(f.verified, true);
    assert.equal(f.onboardingCompleted, true);
  });

  it("state machine happy path", () => {
    assert.equal(
      canTransitionSetupState(SetupStates.AGENT_READY, SetupStates.LLM_REQUIRED),
      true,
    );
    assert.equal(
      canTransitionSetupState(SetupStates.LLM_REQUIRED, SetupStates.LLM_CONNECTED),
      true,
    );
    assert.equal(
      canTransitionSetupState(SetupStates.LLM_CONNECTED, SetupStates.VERIFYING),
      true,
    );
    assert.equal(
      canTransitionSetupState(SetupStates.VERIFYING, SetupStates.VERIFIED),
      true,
    );
    assert.equal(
      canTransitionSetupState(SetupStates.VERIFIED, SetupStates.READY),
      true,
    );
    assert.equal(
      canTransitionSetupState(SetupStates.READY, SetupStates.READY),
      true,
    );
  });

  it("rejects illegal transitions", () => {
    assert.equal(
      canTransitionSetupState(SetupStates.AGENT_READY, SetupStates.READY),
      false,
    );
    assert.equal(
      canTransitionSetupState(SetupStates.LLM_REQUIRED, SetupStates.VERIFIED),
      false,
    );
  });

  it("resume: LLM_REQUIRED survives reload semantics", () => {
    replaceSetupStateForTests({
      state: SetupStates.LLM_REQUIRED,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const again = getSetupState();
    assert.equal(again.state, SetupStates.LLM_REQUIRED);
    assert.equal(again.installationReady, true);
    assert.equal(again.llmConfigured, false);
  });

  it("READY restart stays READY", () => {
    replaceSetupStateForTests({
      state: SetupStates.READY,
      installationReady: true,
      llmConfigured: true,
      verified: true,
      onboardingCompleted: true,
      llmProvider: "anthropic",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const next = transitionSetupState(SetupStates.READY);
    assert.equal(next.state, SetupStates.READY);
    assert.equal(next.onboardingCompleted, true);
  });

  it("failed LLM → error → retry", () => {
    replaceSetupStateForTests({
      state: SetupStates.LLM_REQUIRED,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const err = transitionSetupState(SetupStates.LLM_CONFIGURATION_ERROR, {
      lastErrorCode: "invalid_credential",
      lastErrorMessage: "No pudimos validar la clave.",
    });
    assert.equal(err.state, SetupStates.LLM_CONFIGURATION_ERROR);
    assert.equal(err.lastErrorCode, "invalid_credential");
    const retry = transitionSetupState(SetupStates.LLM_REQUIRED);
    assert.equal(retry.state, SetupStates.LLM_REQUIRED);
    assert.equal(retry.lastErrorCode, null);
  });

  it("LLM_CONNECTED → VERIFYING → VERIFIED", () => {
    replaceSetupStateForTests({
      state: SetupStates.LLM_CONNECTED,
      installationReady: true,
      llmConfigured: true,
      verified: false,
      onboardingCompleted: false,
      llmProvider: "anthropic",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    transitionSetupState(SetupStates.VERIFYING);
    const verified = transitionSetupState(SetupStates.VERIFIED);
    assert.equal(verified.state, SetupStates.VERIFIED);
    assert.equal(verified.verified, true);
    assert.equal(verified.llmConfigured, true);
  });
});

describe("SetupStateStore default", () => {
  it("ensureSetupState defaults to AGENT_READY once", async () => {
    const { db } = await import("../../src/db/database.ts");
    db.prepare("DELETE FROM setup_state").run();
    assert.equal(readSetupState(), null);
    const first = ensureSetupState();
    assert.equal(first.state, SetupStates.AGENT_READY);
    assert.equal(first.installationReady, true);
    const second = ensureSetupState();
    assert.equal(second.state, SetupStates.AGENT_READY);
    assert.equal(second.updatedAt, first.updatedAt);
  });
});

describe("GET /v1/setup/status", () => {
  it("requires install Bearer", async () => {
    replaceSetupStateForTests({
      state: SetupStates.AGENT_READY,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const unauth = await app.request("/v1/setup/status");
    assert.equal(unauth.status, 401);
    const device = await app.request("/v1/setup/status", {
      headers: { Authorization: "Bearer not-the-hub-token" },
    });
    assert.equal(device.status, 401);
  });

  it("returns status DTO without secrets", async () => {
    replaceSetupStateForTests({
      state: SetupStates.AGENT_READY,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/status", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ReturnType<typeof toSetupStatusDto>;
    assert.equal(body.ok, true);
    assert.equal(body.state, SetupStates.AGENT_READY);
    assert.equal(body.installationReady, true);
    assert.equal(body.llmConfigured, false);
    assert.equal(body.verified, false);
    assert.equal(body.onboardingCompleted, false);
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(HUB), false);
    assert.equal(raw.toLowerCase().includes("sk-ant"), false);
  });

  it("POST transition advances and rejects illegal", async () => {
    replaceSetupStateForTests({
      state: SetupStates.AGENT_READY,
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const ok = await app.request("/v1/setup/transition", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state: SetupStates.LLM_REQUIRED }),
    });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { state: string };
    assert.equal(body.state, SetupStates.LLM_REQUIRED);

    const bad = await app.request("/v1/setup/transition", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state: SetupStates.READY }),
    });
    assert.equal(bad.status, 409);
  });
});
