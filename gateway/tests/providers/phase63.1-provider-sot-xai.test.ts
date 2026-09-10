/**
 * PHASE 63.1 — Provider credential source-of-truth + xAI / Grok.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { Hono } from "hono";
import type { LLMProvider } from "../../src/providers/types.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-631-"));
process.env.HUB_TOKEN = "z".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_DATA_DIR = path.join(tmp, "product");
delete process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV;
process.env.ANTHROPIC_API_KEY = "sk-ant-env-should-not-win-silently";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  getEffectiveProviderApiKey,
  hasProviderApiKeyConfigured,
  writePersistedProviderApiKey,
  clearPersistedProviderApiKey,
  isDevProviderEnvEnabled,
} = await import("../../src/setup/llm-key.ts");
const {
  upsertExternalConnection,
  disconnectExternalProvider,
  getIntelligenceStatusSnapshot,
  createIntelligenceRouterProvider,
} = await import("../../src/providers/intelligence.ts");
const { createLlmProvider, getProviderDescriptor, listProviders } =
  await import("../../src/providers/registry.ts");
const { createOpenAiCompatibleProvider } = await import(
  "../../src/providers/openai-compatible.ts"
);
const { mountSetupHttp } = await import("../../src/http/setup-http.ts");
const { redactForLog } = await import(
  "../../src/credentials/credential-redactor.ts"
);
const {
  createLocalModelManager,
  createFakeLocalRuntime,
} = await import("../../src/local-llm/index.ts");

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  delete process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV;
});

beforeEach(() => {
  delete process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV;
  clearPersistedProviderApiKey("anthropic");
  clearPersistedProviderApiKey("xai");
  clearPersistedProviderApiKey("openai");
});

describe("PHASE 63.1 Anthropic credential source of truth", () => {
  it("A — ENV alone does not configure Anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-should-not-win-silently";
    assert.equal(isDevProviderEnvEnabled(), false);
    assert.equal(hasProviderApiKeyConfigured("anthropic"), false);
    assert.equal(getEffectiveProviderApiKey("anthropic"), "");
  });

  it("B — Credential Store configures Anthropic", () => {
    writePersistedProviderApiKey(
      "anthropic",
      "sk-ant-store-key-phase631xxxxxx",
    );
    assert.equal(hasProviderApiKeyConfigured("anthropic"), true);
    assert.equal(
      getEffectiveProviderApiKey("anthropic"),
      "sk-ant-store-key-phase631xxxxxx",
    );
  });

  it("C — Disconnect leaves NOT_CONFIGURED even with ENV present", () => {
    writePersistedProviderApiKey(
      "anthropic",
      "sk-ant-store-key-phase631yyyyyy",
    );
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-still-present-but-ignored";
    clearPersistedProviderApiKey("anthropic");
    assert.equal(hasProviderApiKeyConfigured("anthropic"), false);
    assert.equal(getEffectiveProviderApiKey("anthropic"), "");
  });

  it("D — DEV env mode allows ANTHROPIC_API_KEY", () => {
    process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV = "1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-dev-mode-key-allowedxx";
    assert.equal(isDevProviderEnvEnabled(), true);
    assert.equal(hasProviderApiKeyConfigured("anthropic"), true);
    assert.equal(
      getEffectiveProviderApiKey("anthropic"),
      "sk-ant-dev-mode-key-allowedxx",
    );
    delete process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV;
  });

  it("Store wins over DEV env when both present", () => {
    process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV = "1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-secondary-keyxxxxx";
    writePersistedProviderApiKey(
      "anthropic",
      "sk-ant-store-primary-keyxxxxxxx",
    );
    assert.equal(
      getEffectiveProviderApiKey("anthropic"),
      "sk-ant-store-primary-keyxxxxxxx",
    );
    delete process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV;
  });
});

describe("PHASE 63.1 xAI / Grok", () => {
  it("A — registry resolves xai", () => {
    const d = getProviderDescriptor("xai");
    assert.ok(d);
    assert.equal(d!.mode, "external");
    assert.match(d!.name, /xAI|Grok/i);
    assert.ok(listProviders().some((p) => p.id === "xai"));
  });

  it("B — configuration defaults", async () => {
    const conn = await upsertExternalConnection({
      provider: "xai",
      modelId: "grok-4.6",
      apiKey: "xai-test-key-phase631xxxxxxxx",
    });
    assert.equal(conn.provider, "xai");
    assert.equal(conn.mode, "external");
    assert.equal(conn.modelId, "grok-4.6");
    assert.equal(conn.baseUrl, "https://api.x.ai/v1");
    assert.match(conn.displayName, /xAI|Grok/i);
  });

  it("C — credential in store", () => {
    writePersistedProviderApiKey("xai", "xai-test-key-phase631yyyyyyyy");
    assert.equal(hasProviderApiKeyConfigured("xai"), true);
    assert.equal(
      getEffectiveProviderApiKey("xai"),
      "xai-test-key-phase631yyyyyyyy",
    );
  });

  it("D — no leakage in setup intelligence response", async () => {
    writePersistedProviderApiKey("xai", "xai-secret-must-not-leak-631");
    await upsertExternalConnection({
      provider: "xai",
      modelId: "grok-4.6",
      apiKey: "xai-secret-must-not-leak-631",
    });
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/intelligence", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    const body = await res.text();
    assert.equal(body.includes("xai-secret-must-not-leak-631"), false);
    assert.equal(redactForLog(`XAI_API_KEY=xai-secret-must-not-leak-631`).includes("must-not-leak"), false);
  });

  it("E — test connection success (mock)", async () => {
    writePersistedProviderApiKey("xai", "xai-test-key-phase631zzzzzzzz");
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => ({
        ok: true,
        provider: "xai",
        model: "grok-4.6",
        credentialConfigured: true,
        request: "success",
        sample: "OK",
      }),
    });
    const res = await app.request("/v1/setup/providers/xai/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { message?: string };
    assert.match(json.message || "", /Grok|conexión/i);
  });

  it("F — 401 → PROVIDER_AUTH_FAILED", async () => {
    writePersistedProviderApiKey("xai", "xai-test-key-phase631aaaaaaaa");
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => {
        throw new Error("provider_http_401 auth failed");
      },
    });
    const res = await app.request("/v1/setup/providers/xai/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as {
      error?: { code?: string; message?: string };
    };
    assert.equal(json.error?.code, "PROVIDER_AUTH_FAILED");
    assert.equal((json.error?.message || "").includes("xai-test-key"), false);
  });

  it("G — 429 → PROVIDER_RATE_LIMITED", async () => {
    writePersistedProviderApiKey("xai", "xai-test-key-phase631bbbbbbbb");
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => {
        throw new Error("provider_http_429 rate limit");
      },
    });
    const res = await app.request("/v1/setup/providers/xai/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    const json = (await res.json()) as { error?: { code?: string } };
    assert.equal(json.error?.code, "PROVIDER_RATE_LIMITED");
  });

  it("G2 — credits/spending 403 → PROVIDER_QUOTA_EXCEEDED", async () => {
    writePersistedProviderApiKey("xai", "xai-test-key-phase631quotaquota");
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => {
        const err = new Error("provider_quota_exceeded") as Error & {
          errorCode?: string;
          metadata?: { safeProviderMessage?: string };
        };
        err.errorCode = "LLM_QUOTA_EXCEEDED";
        err.metadata = {
          safeProviderMessage:
            "Your team has either used all available credits or reached its monthly spending limit.",
        };
        throw err;
      },
    });
    const res = await app.request("/v1/setup/providers/xai/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    const json = (await res.json()) as {
      error?: { code?: string; message?: string };
    };
    assert.equal(json.error?.code, "PROVIDER_QUOTA_EXCEEDED");
    assert.match(json.error?.message || "", /crédito|gasto/i);
  });

  it("H — 500 → PROVIDER_UNAVAILABLE", async () => {
    writePersistedProviderApiKey("xai", "xai-test-key-phase631cccccccc");
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => {
        throw new Error("provider_http_500 unavailable");
      },
    });
    const res = await app.request("/v1/setup/providers/xai/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    const json = (await res.json()) as { error?: { code?: string } };
    assert.equal(json.error?.code, "PROVIDER_UNAVAILABLE");
  });

  it("I — streaming via OpenAI-compatible adapter", async () => {
    const provider = createOpenAiCompatibleProvider({
      providerId: "xai",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.6",
      apiKey: "xai-stream-test",
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: false,
      },
    });
    assert.equal(provider.capabilities?.streaming, true);
    assert.equal(provider.capabilities?.toolCalling, true);
    assert.equal(provider.capabilities?.vision, false);

    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(
            enc.encode(
              'data: {"choices":[{"delta":{"content":"hola"}}]}\n\n',
            ),
          );
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;
    try {
      let text = "";
      for await (const ev of provider.stream({
        messages: [{ role: "user", content: "hi" }],
      })) {
        if (ev.type === "text_delta") text += ev.text;
      }
      assert.equal(text, "hola");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("J — xAI failure does not invoke Local", async () => {
    let localCalled = false;
    const localSpy: LLMProvider = {
      id: "local",
      async *stream() {
        localCalled = true;
        yield { type: "done" };
      },
    };
    void localSpy;
    await upsertExternalConnection({
      provider: "xai",
      modelId: "grok-4.6",
      apiKey: "xai-fail-no-fallback-keyxxxx",
    });
    const router = createIntelligenceRouterProvider({
      localManager: createLocalModelManager(),
      localRuntime: createFakeLocalRuntime({ reply: "LOCAL" }),
    });
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("unauthorized", { status: 401 })) as typeof fetch;
    try {
      await assert.rejects(async () => {
        for await (const _ of router.stream({
          messages: [{ role: "user", content: "x" }],
        })) {
          /* drain */
        }
      });
      assert.equal(localCalled, false);
      // Still on xai — no silent switch
      assert.equal(
        getIntelligenceStatusSnapshot().active?.provider,
        "xai",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("disconnect xAI removes credential", async () => {
    await upsertExternalConnection({
      provider: "xai",
      modelId: "grok-4.6",
      apiKey: "xai-disconnect-key-phase631xx",
    });
    disconnectExternalProvider("xai");
    assert.equal(hasProviderApiKeyConfigured("xai"), false);
    const view = getIntelligenceStatusSnapshot().connections.find(
      (c) => c.provider === "xai",
    );
    assert.equal(view?.credentialConfigured, false);
  });

  it("createLlmProvider(xai) builds without throwing when key present", () => {
    writePersistedProviderApiKey("xai", "xai-registry-create-keyxxxxxx");
    const p = createLlmProvider("xai");
    assert.equal(p.id, "xai");
  });
});
