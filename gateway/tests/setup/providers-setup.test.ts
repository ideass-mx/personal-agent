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

const { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_NAME } = await import(
  "../../src/agents/definition.ts"
);

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
  it("lists local + anthropic available; openai/google not faked", () => {
    const list = listProviders();
    assert.equal(list.length, 4);
    assert.equal(isProviderAvailable("local"), true);
    assert.equal(isProviderAvailable("anthropic"), true);
    assert.equal(isProviderAvailable("openai"), false);
    assert.equal(isProviderAvailable("google"), false);
    assert.equal(getProviderDescriptor("openai")?.available, false);
  });

  it("DEFAULT_AGENT_MODEL is claude-sonnet-4-6; local + Anthropic available", () => {
    assert.equal(DEFAULT_AGENT_MODEL, "claude-sonnet-4-6");
    assert.equal(DEFAULT_AGENT_NAME, "Personal Agent");
    assert.equal(isProviderAvailable("local"), true);
    assert.equal(isProviderAvailable("anthropic"), true);
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
  it("success via real provider path (injected) includes connectivity", async () => {
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
      verifyLlm: async () => ({
        ok: true,
        provider: "anthropic",
        model: DEFAULT_AGENT_MODEL,
        credentialConfigured: true,
        request: "success",
        sample: "OK",
      }),
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
    const body = (await res.json()) as {
      state: string;
      verified: boolean;
      connectivity?: {
        provider?: string;
        model?: string;
        credentialConfigured?: boolean;
        request?: string;
        sample?: string;
        apiKey?: string;
      };
    };
    assert.equal(body.state, SetupStates.VERIFIED);
    assert.equal(body.verified, true);
    assert.equal(body.connectivity?.provider, "anthropic");
    assert.equal(body.connectivity?.model, "claude-sonnet-4-6");
    assert.equal(body.connectivity?.credentialConfigured, true);
    assert.equal(body.connectivity?.request, "success");
    assert.equal(body.connectivity?.sample, undefined);
    assert.equal(body.connectivity?.apiKey, undefined);
    assert.equal(JSON.stringify(body).toLowerCase().includes("api_key"), false);
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
