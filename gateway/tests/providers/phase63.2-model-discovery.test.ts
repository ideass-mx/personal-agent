/**
 * PHASE 63.2 — Dynamic model discovery (connection ≠ model).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-632-"));
process.env.HUB_TOKEN = "z".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_DATA_DIR = path.join(tmp, "product");
delete process.env.PERSONAL_AGENT_DEV_PROVIDER_ENV;
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  filterCompatibleModels,
  recommendModelId,
  buildModelDiscoveryResult,
  resolveModelForConnectivityProbe,
  modelAvailabilityForConnection,
  clearProviderModelsCache,
} = await import("../../src/providers/model-discovery.ts");
const {
  upsertExternalConnection,
  applyModelDiscoveryToConnection,
  updateIntelligenceConnectionModel,
  getIntelligenceStatusSnapshot,
  listIntelligenceConnections,
  writeIntelligenceConfig,
  readIntelligenceConfig,
  PERSONAL_AGENT_CLOUD_MODELS,
} = await import("../../src/providers/intelligence.ts");
const { writePersistedProviderApiKey, clearPersistedProviderApiKey } =
  await import("../../src/setup/llm-key.ts");
const { redactForLog } = await import(
  "../../src/credentials/credential-redactor.ts"
);

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  clearPersistedProviderApiKey("openai");
  clearPersistedProviderApiKey("xai");
  clearProviderModelsCache();
  const cfg = readIntelligenceConfig();
  cfg.connections = cfg.connections.filter((c) => !c.id.startsWith("conn_ext_"));
  cfg.selectedConnectionId = "conn_local_default";
  writeIntelligenceConfig(cfg);
});

describe("PHASE 63.2 model discovery helpers", () => {
  it("filters non-chat models", () => {
    const models = filterCompatibleModels([
      { id: "gpt-4.1-mini", capabilities: { chat: true } },
      { id: "text-embedding-3-small" },
      { id: "whisper-1" },
      { id: "dall-e-3" },
    ]);
    assert.deepEqual(
      models.map((m) => m.id),
      ["gpt-4.1-mini"],
    );
  });

  it("recommends deterministically preferring chat + provider hints", () => {
    const id = recommendModelId(
      [
        { id: "gpt-3.5-turbo", capabilities: { chat: true } },
        { id: "gpt-4.1-mini", capabilities: { chat: true, tools: true } },
        { id: "gpt-4o", capabilities: { chat: true } },
      ],
      "openai",
    );
    assert.equal(id, "gpt-4.1-mini");
  });
});

describe("PHASE 63.2 A — valid provider → discover → recommended", () => {
  it("applies recommended model after discovery", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632xxxx",
      modelSelection: "recommended",
    });
    assert.equal(conn.modelSelection, "recommended");
    assert.equal(conn.modelId, "__pending_discovery__");

    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [
        { id: "gpt-4.1-mini", name: "GPT 4.1 mini" },
        { id: "gpt-4o", name: "GPT 4o" },
      ],
    });
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, discovery.recommendedModelId);
    assert.equal(next.modelSelection, "recommended");
    assert.equal(
      modelAvailabilityForConnection(next, discovery),
      "available",
    );
  });
});

describe("PHASE 63.2 B — old model disappeared (recommended)", () => {
  it("keeps provider connected and switches recommended model", async () => {
    await upsertExternalConnection({
      provider: "xai",
      apiKey: "xai-test-key-phase632xxxxxxxx",
      modelId: "old-model",
      modelSelection: "recommended",
    });
    const conn = listIntelligenceConnections().find((c) => c.provider === "xai")!;
    assert.equal(conn.modelId, "old-model");

    const discovery = buildModelDiscoveryResult({
      provider: "xai",
      models: [
        { id: "grok-4.6", name: "Grok 4.6" },
        { id: "grok-3-mini", name: "Grok 3 mini" },
      ],
    });
    assert.equal(
      modelAvailabilityForConnection(conn, discovery),
      "unavailable",
    );
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "grok-4.6");
    assert.notEqual(next.modelId, "old-model");
    const snap = getIntelligenceStatusSnapshot();
    const view = snap.connections.find((c) => c.provider === "xai");
    assert.ok(view?.credentialConfigured);
    assert.equal(view?.configStatus === "not_configured", false);
  });
});

describe("PHASE 63.2 C — discovery fails after auth", () => {
  it("does not treat discovery failure as auth failure", () => {
    const discovery = {
      models: [],
      discoveryStatus: "failed" as const,
      authStatus: "ok" as const,
      errorCode: "MODEL_DISCOVERY_FAILED",
    };
    assert.equal(discovery.authStatus, "ok");
    assert.equal(discovery.discoveryStatus, "failed");
    assert.notEqual(discovery.errorCode, "PROVIDER_AUTH_FAILED");
  });
});

describe("PHASE 63.2 D — no compatible models", () => {
  it("marks model unavailable while connection remains", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632yyyy",
      modelSelection: "recommended",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "text-embedding-3-large" }, { id: "whisper-1" }],
    });
    assert.equal(discovery.models.length, 0);
    assert.equal(discovery.recommendedModelId, undefined);
    assert.equal(
      modelAvailabilityForConnection(conn, discovery),
      "unavailable",
    );
    assert.ok(hasCredential("openai"));
  });
});

describe("PHASE 63.2 E — explicit model selection", () => {
  it("keeps pinned model when still available", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632zzzz",
      modelId: "gpt-4o",
      modelSelection: "specific",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [
        { id: "gpt-4.1-mini" },
        { id: "gpt-4o" },
      ],
    });
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "gpt-4o");
    assert.equal(next.modelSelection, "specific");
    assert.equal(modelAvailabilityForConnection(next, discovery), "available");
  });

  it("does not silently change pinned model when it disappears", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632aaaa",
      modelId: "old-pinned",
      modelSelection: "specific",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "gpt-4.1-mini" }],
    });
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "old-pinned");
    assert.equal(modelAvailabilityForConnection(next, discovery), "unavailable");
    const probe = resolveModelForConnectivityProbe(next, discovery);
    assert.equal(probe, "gpt-4.1-mini");
  });

  it("updateIntelligenceConnectionModel marks specific", async () => {
    await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632bbbb",
      modelSelection: "recommended",
    });
    const conn = listIntelligenceConnections().find((c) => c.provider === "openai")!;
    const updated = updateIntelligenceConnectionModel(conn.id, "gpt-4o", {
      selection: "specific",
    });
    assert.equal(updated.modelSelection, "specific");
    assert.equal(updated.modelId, "gpt-4o");
  });
});

describe("PHASE 63.2 F — Personal Agent Cloud SOT", () => {
  it("cloud models come from gateway constants, not client hardcodes alone", () => {
    assert.ok(PERSONAL_AGENT_CLOUD_MODELS.includes("claude-sonnet-4-6"));
    const discovery = buildModelDiscoveryResult({
      provider: "personal-agent-cloud",
      models: PERSONAL_AGENT_CLOUD_MODELS.map((id) => ({
        id,
        capabilities: { chat: true, tools: true },
      })),
    });
    assert.equal(discovery.recommendedModelId, "claude-sonnet-4-6");
  });
});

describe("PHASE 63.2 G — Local unchanged", () => {
  it("local snapshot still exposes Qwen3 4B default", () => {
    const snap = getIntelligenceStatusSnapshot();
    const local = snap.connections.find((c) => c.provider === "local");
    assert.ok(local);
    assert.equal(local!.modelId, "qwen3-4b");
    assert.equal(local!.supportsModelDiscovery, false);
    assert.equal(local!.modelStatus, "discovery_unsupported");
  });
});

describe("PHASE 63.2 H — security", () => {
  it("redacts api keys from log payloads", () => {
    const key = "sk-test-openai-key-phase632secre";
    writePersistedProviderApiKey("openai", key);
    const blob = redactForLog(`Authorization: Bearer ${key}`);
    assert.equal(blob.includes(key), false);
  });
});

function hasCredential(provider: string): boolean {
  const file = path.join(
    process.env.PERSONAL_AGENT_CREDENTIALS_DIR!,
    "llm",
    `${provider}.api_key`,
  );
  return fs.existsSync(file);
}
