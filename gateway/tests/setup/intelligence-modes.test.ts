import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-intel-62-"));
process.env.HUB_TOKEN = "z".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_DATA_DIR = path.join(tmp, "product");
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  listIntelligenceConnections,
  getIntelligenceConnection,
  selectIntelligenceConnection,
  upsertExternalConnection,
  localAvailabilitySummary,
} = await import("../../src/providers/intelligence.ts");
const { isAnyLlmConfigured } = await import("../../src/providers/registry.ts");

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("PHASE 62 intelligence modes", () => {
  it("A — default mode is explicit local/cloud/external config", () => {
    const list = listIntelligenceConnections();
    assert.ok(list.some((c) => c.mode === "local"));
    assert.ok(list.some((c) => c.mode === "personal-agent-cloud"));
    assert.ok(list.some((c) => c.mode === "external"));
    const selected = getIntelligenceConnection();
    assert.ok(selected);
    assert.ok(selected?.mode === "local" || selected?.mode === "external");
  });

  it("B — user can switch mode without fallback", () => {
    const cloud = listIntelligenceConnections().find(
      (c) => c.provider === "personal-agent-cloud",
    );
    assert.ok(cloud);
    const selected = selectIntelligenceConnection(cloud!.id);
    assert.equal(selected.provider, "personal-agent-cloud");
    assert.equal(getIntelligenceConnection()?.provider, "personal-agent-cloud");
  });

  it("C — local remains available on weak hardware (warning/no block)", () => {
    const local = localAvailabilitySummary();
    assert.equal(local.available, true);
    assert.equal(typeof local.warning === "string" || local.warning === null, true);
  });

  it("D — rejects unsafe baseUrl for openai-compatible", async () => {
    await assert.rejects(
      () =>
        upsertExternalConnection({
          provider: "openai-compatible",
          modelId: "gpt-4.1-mini",
          apiKey: "sk-test-1234567890123456",
          baseUrl: "http://127.0.0.1:9000/v1",
        }),
      /base_url_unsafe/,
    );
  });

  it("E — external connection stores ref, not secret in config", async () => {
    const conn = await upsertExternalConnection({
      provider: "openai",
      modelId: "gpt-4.1-mini",
      apiKey: "sk-test-abcdefghijklmnopqrstuvwxyz",
    });
    assert.equal(conn.mode, "external");
    assert.ok(conn.credentialRef);
    const selected = getIntelligenceConnection();
    assert.equal(selected?.provider, "openai");
    const cfgRaw = fs.readFileSync(
      path.join(process.env.PERSONAL_AGENT_DATA_DIR!, "config", "intelligence.json"),
      "utf8",
    );
    assert.equal(cfgRaw.includes("sk-test-abcdefghijklmnopqrstuvwxyz"), false);
  });

  it("F — no automatic fallback when selected mode has no readiness", () => {
    const current = getIntelligenceConnection();
    assert.ok(current);
    // If cloud selected without base URL, readiness is false and should stay false.
    delete process.env.PERSONAL_AGENT_CLOUD_BASE_URL;
    if (current?.provider === "personal-agent-cloud") {
      assert.equal(isAnyLlmConfigured(), false);
    }
  });
});
