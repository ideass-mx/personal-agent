/**
 * PHASE 63.2 — Dynamic discovery + static recommendations.
 * AVAILABLE ≠ RECOMMENDED ≠ SELECTED
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-632b-"));
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
  buildModelDiscoveryResult,
  resolveModelForConnectivityProbe,
  modelAvailabilityForConnection,
  clearProviderModelsCache,
} = await import("../../src/providers/model-discovery.ts");
const {
  resolveRecommendedAgainstAvailable,
  StaticModelRecommendationSource,
  setModelRecommendationSource,
  resetModelRecommendationSource,
  PROVIDER_MODEL_DEFAULTS,
} = await import("../../src/providers/model-recommendation.ts");
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
  resetModelRecommendationSource();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  resetModelRecommendationSource();
  clearPersistedProviderApiKey("openai");
  clearPersistedProviderApiKey("xai");
  clearProviderModelsCache();
  const cfg = readIntelligenceConfig();
  cfg.connections = cfg.connections.filter((c) => !c.id.startsWith("conn_ext_"));
  cfg.selectedConnectionId = "conn_local_default";
  writeIntelligenceConfig(cfg);
});

describe("PHASE 63.2 A — discovery success", () => {
  it("keeps all provider-returned models as available", () => {
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [
        { id: "model-a" },
        { id: "model-b" },
        { id: "model-c" },
        { id: "text-embedding-3-small" },
      ],
    });
    assert.deepEqual(
      discovery.models.map((m) => m.id),
      ["model-a", "model-b", "model-c", "text-embedding-3-small"],
    );
  });
});

describe("PHASE 63.2 B — static recommendation available", () => {
  it("recommends only when static id is in available", () => {
    setModelRecommendationSource({
      getRecommendedModel: () => "model-b",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "model-a" }, { id: "model-b" }, { id: "model-c" }],
    });
    assert.equal(discovery.recommendedModelId, "model-b");
  });
});

describe("PHASE 63.2 C — static recommendation unavailable", () => {
  it("returns recommended=null and never invents the static id", () => {
    setModelRecommendationSource({
      getRecommendedModel: () => "model-x",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "model-a" }, { id: "model-b" }],
    });
    assert.equal(discovery.recommendedModelId, null);
    assert.equal(
      discovery.models.some((m) => m.id === "model-x"),
      false,
    );
    assert.equal(
      resolveRecommendedAgainstAvailable("openai", ["model-a", "model-b"]),
      null,
    );
  });
});

describe("PHASE 63.2 D — selected remains available", () => {
  it("keeps selected model after refresh when still listed", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632dddd",
      modelId: "model-b",
      modelSelection: "specific",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "model-a" }, { id: "model-b" }, { id: "model-c" }],
    });
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "model-b");
    assert.equal(modelAvailabilityForConnection(next, discovery), "available");
  });
});

describe("PHASE 63.2 E — selected retired", () => {
  it("keeps provider connected with selected unavailable", async () => {
    await upsertExternalConnection({
      provider: "xai",
      apiKey: "xai-test-key-phase632eeeeeeee",
      modelId: "model-b",
      modelSelection: "specific",
    });
    const conn = listIntelligenceConnections().find((c) => c.provider === "xai")!;
    const discovery = buildModelDiscoveryResult({
      provider: "xai",
      models: [{ id: "model-a" }, { id: "model-c" }],
    });
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "model-b");
    assert.equal(modelAvailabilityForConnection(next, discovery), "unavailable");
    const snap = getIntelligenceStatusSnapshot();
    const view = snap.connections.find((c) => c.provider === "xai");
    assert.equal(view?.credentialConfigured, true);
    assert.notEqual(view?.configStatus, "not_configured");
    const probe = resolveModelForConnectivityProbe(next, discovery);
    assert.ok(["model-a", "model-c"].includes(probe));
  });
});

describe("PHASE 63.2 F — auth failure", () => {
  it("maps auth failed without inventing models", () => {
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [],
      authStatus: "failed",
      discoveryStatus: "failed",
    });
    // buildModelDiscoveryResult still computes recommendation against empty;
    // auth failure shape from listModels:
    assert.equal(discovery.authStatus, "failed");
    assert.equal(discovery.models.length, 0);
  });
});

describe("PHASE 63.2 G — refresh catalog", () => {
  it("updates available set; retired model leaves selected unavailable", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632gggg",
      modelId: "model-b",
      modelSelection: "specific",
    });
    const first = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "model-a" }, { id: "model-b" }],
    });
    applyModelDiscoveryToConnection(conn.id, first);
    const refreshed = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "model-a" }, { id: "model-c" }],
    });
    const next = applyModelDiscoveryToConnection(conn.id, refreshed);
    assert.deepEqual(
      refreshed.models.map((m) => m.id),
      ["model-a", "model-c"],
    );
    assert.equal(next.modelId, "model-b");
    assert.equal(modelAvailabilityForConnection(next, refreshed), "unavailable");
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

describe("PHASE 63.2 I — Local unchanged", () => {
  it("local snapshot still exposes Qwen3 4B without remote discovery", () => {
    const snap = getIntelligenceStatusSnapshot();
    const local = snap.connections.find((c) => c.provider === "local");
    assert.ok(local);
    assert.equal(local!.modelId, "qwen3-4b");
    assert.equal(local!.supportsModelDiscovery, false);
    assert.equal(local!.modelStatus, "discovery_unsupported");
  });
});

describe("PHASE 63.2 J — Cloud SOT", () => {
  it("cloud uses gateway cloud models, not third-party hardcodes in client path", () => {
    assert.ok(PERSONAL_AGENT_CLOUD_MODELS.includes("claude-sonnet-4-6"));
    assert.equal(
      PROVIDER_MODEL_DEFAULTS["personal-agent-cloud"]?.recommendedModel,
      "claude-sonnet-4-6",
    );
    const discovery = buildModelDiscoveryResult({
      provider: "personal-agent-cloud",
      models: PERSONAL_AGENT_CLOUD_MODELS.map((id) => ({ id })),
    });
    assert.equal(discovery.recommendedModelId, "claude-sonnet-4-6");
  });
});

describe("PHASE 63.2 pending connect uses recommended or first", () => {
  it("applies static recommended when available", async () => {
    setModelRecommendationSource(new StaticModelRecommendationSource());
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632pend",
      modelSelection: "recommended",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [
        { id: "gpt-4o" },
        { id: "gpt-4.1-mini" },
        { id: "gpt-4.1" },
      ],
    });
    assert.equal(discovery.recommendedModelId, "gpt-4.1-mini");
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "gpt-4.1-mini");
  });

  it("falls back to first available when static missing", async () => {
    setModelRecommendationSource({
      getRecommendedModel: () => "missing-model",
    });
    const conn = await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632falt",
      modelSelection: "recommended",
    });
    const discovery = buildModelDiscoveryResult({
      provider: "openai",
      models: [{ id: "model-a" }, { id: "model-b" }],
    });
    assert.equal(discovery.recommendedModelId, null);
    const next = applyModelDiscoveryToConnection(conn.id, discovery);
    assert.equal(next.modelId, "model-a");
  });
});

describe("PHASE 63.2 update marks specific", () => {
  it("pins explicit selection", async () => {
    await upsertExternalConnection({
      provider: "openai",
      apiKey: "sk-test-openai-key-phase632pinx",
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
