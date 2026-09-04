/**
 * Fase 5 — Provider registry + setup LLM HTTP + AGENT_READY sin LLM.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-setup-prov-"));
// Placeholder de tests: no cuenta como LLM configurado (ver isPlaceholderKey).
process.env.ANTHROPIC_API_KEY = "sk-ant-test-providers-setup";
process.env.HUB_TOKEN = "b".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_ID = "22222222-2222-4222-8222-222222222222";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  SetupStates,
  ensureSetupState,
  getSetupState,
  replaceSetupStateForTests,
  hasProviderApiKeyConfigured,
  writePersistedProviderApiKey,
  readPersistedProviderApiKey,
} = await import("../../src/setup/index.ts");

const {
  listProviders,
  isProviderAvailable,
  getProviderDescriptor,
} = await import("../../src/providers/registry.ts");

const { mountSetupHttp } = await import("../../src/http/setup-http.ts");

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("ProviderRegistry", () => {
  it("lists anthropic available; openai/google not faked", () => {
    const list = listProviders();
    assert.equal(list.length, 3);
    assert.equal(isProviderAvailable("anthropic"), true);
    assert.equal(isProviderAvailable("openai"), false);
    assert.equal(isProviderAvailable("google"), false);
    assert.equal(getProviderDescriptor("openai")?.available, false);
  });
});

describe("AGENT_READY without LLM / Tailscale / Android", () => {
  it("defaults to AGENT_READY with no real credential", async () => {
    assert.equal(hasProviderApiKeyConfigured("anthropic"), false);
    const { db } = await import("../../src/db/database.ts");
    db.prepare("DELETE FROM setup_state").run();
    const first = ensureSetupState();
    assert.equal(first.state, SetupStates.AGENT_READY);
    assert.equal(first.installationReady, true);
    assert.equal(first.llmConfigured, false);
    assert.equal(first.onboardingCompleted, false);
  });
});

describe("GET /v1/setup/providers", () => {
  it("returns catalog without secrets", async () => {
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/providers", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      providers: Array<{ id: string; available: boolean }>;
    };
    assert.ok(body.providers.some((p) => p.id === "anthropic" && p.available));
    assert.ok(body.providers.some((p) => p.id === "openai" && !p.available));
    const raw = JSON.stringify(body);
    assert.equal(raw.toLowerCase().includes("api_key"), false);
    assert.equal(raw.toLowerCase().includes("sk-ant"), false);
  });
});

describe("POST /v1/setup/llm", () => {
  it("rejects unsupported provider", async () => {
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
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/llm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "openai",
        credential: "sk-test-openai-key-123456",
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "provider_unsupported");
  });

  it("persists credential and never returns it", async () => {
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
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const secret = "sk-ant-real-looking-key-abcdef";
    const res = await app.request("/v1/setup/llm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider: "anthropic", credential: secret }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(secret), false);
    assert.equal(body.credential, undefined);
    assert.equal(body.apiKey, undefined);
    assert.equal(getSetupState().state, SetupStates.LLM_CONNECTED);
    assert.equal(readPersistedProviderApiKey("anthropic"), secret);
    assert.ok(
      fs.existsSync(path.join(tmp, "credentials", "llm", "anthropic.api_key")),
    );
  });

  it("rejects missing credential", async () => {
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
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/llm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider: "anthropic", credential: "short" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("POST /v1/setup/verify", () => {
  it("success via real provider path (injected)", async () => {
    writePersistedProviderApiKey("anthropic", "sk-ant-verify-success-keyxx");
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
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => ({ ok: true, sample: "OK" }),
    });
    const res = await app.request("/v1/setup/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { state: string; verified: boolean };
    assert.equal(body.state, SetupStates.VERIFIED);
    assert.equal(body.verified, true);
  });

  it("failure returns human message without secret", async () => {
    writePersistedProviderApiKey("anthropic", "sk-ant-verify-fail-keyxxxxxx");
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
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => {
        throw new Error("upstream_boom");
      },
    });
    const res = await app.request("/v1/setup/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error?: { message?: string; code?: string };
    };
    assert.match(body.error?.message || "", /proveedor de IA/i);
    assert.equal(JSON.stringify(body).includes("upstream_boom"), false);
    assert.equal(getSetupState().state, SetupStates.VERIFICATION_ERROR);
  });

  it("missing credential rejected", async () => {
    for (const f of [
      path.join(tmp, "credentials", "llm", "anthropic.api_key"),
      path.join(tmp, "credentials", "anthropic.api_key"),
    ]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
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
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "llm_not_configured");
  });
});
