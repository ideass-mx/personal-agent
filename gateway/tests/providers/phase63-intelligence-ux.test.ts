/**
 * PHASE 63 — Intelligence connection management UX (API + persistence).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { Hono } from "hono";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-intel-63-"));
process.env.HUB_TOKEN = "z".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_DATA_DIR = path.join(tmp, "product");
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const {
  getIntelligenceStatusSnapshot,
  selectIntelligenceConnection,
  upsertExternalConnection,
  disconnectExternalProvider,
  readIntelligenceConfig,
} = await import("../../src/providers/intelligence.ts");
const { mountSetupHttp } = await import("../../src/http/setup-http.ts");
const { writePersistedProviderApiKey, hasProviderApiKeyConfigured } =
  await import("../../src/setup/llm-key.ts");
const { redactForLog } = await import(
  "../../src/credentials/credential-redactor.ts"
);

const HUB = process.env.HUB_TOKEN!;

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("PHASE 63 active provider + switch", () => {
  it("only one connection is active at a time", async () => {
    const cloud = getIntelligenceStatusSnapshot().connections.find(
      (c) => c.provider === "personal-agent-cloud",
    );
    assert.ok(cloud);
    selectIntelligenceConnection(cloud!.id);
    let snap = getIntelligenceStatusSnapshot();
    assert.equal(snap.active?.provider, "personal-agent-cloud");
    assert.equal(snap.connections.filter((c) => c.active).length, 1);

    const local = snap.connections.find((c) => c.provider === "local");
    assert.ok(local);
    selectIntelligenceConnection(local!.id);
    snap = getIntelligenceStatusSnapshot();
    assert.equal(snap.active?.provider, "local");
    assert.equal(snap.connections.filter((c) => c.active).length, 1);

    await upsertExternalConnection({
      provider: "openai",
      modelId: "gpt-4.1-mini",
      apiKey: "sk-test-openai-key-phase63xxxx",
    });
    snap = getIntelligenceStatusSnapshot();
    assert.equal(snap.active?.provider, "openai");
    assert.equal(snap.connections.filter((c) => c.active).length, 1);
  });

  it("persistence restores selected connection without secrets in file", async () => {
    const cfgPath = path.join(
      process.env.PERSONAL_AGENT_DATA_DIR!,
      "config",
      "intelligence.json",
    );
    const raw = fs.readFileSync(cfgPath, "utf8");
    assert.equal(raw.includes("sk-test-openai-key-phase63xxxx"), false);
    const again = readIntelligenceConfig();
    assert.equal(again.selectedConnectionId, "conn_ext_openai");
  });

  it("BYOK disconnect removes credential and clears active if needed", () => {
    assert.equal(hasProviderApiKeyConfigured("openai"), true);
    disconnectExternalProvider("openai");
    assert.equal(hasProviderApiKeyConfigured("openai"), false);
    const snap = getIntelligenceStatusSnapshot();
    assert.notEqual(snap.active?.provider, "openai");
    const openai = snap.connections.find((c) => c.provider === "openai");
    assert.equal(openai?.credentialConfigured, false);
    assert.equal(openai?.configStatus, "not_configured");
  });

  it("reconnect BYOK then switch back to cloud leaves openai configured", async () => {
    await upsertExternalConnection({
      provider: "openai",
      modelId: "gpt-4.1-mini",
      apiKey: "sk-test-openai-key-phase63yyyy",
    });
    const cloud = getIntelligenceStatusSnapshot().connections.find(
      (c) => c.provider === "personal-agent-cloud",
    );
    selectIntelligenceConnection(cloud!.id);
    const snap = getIntelligenceStatusSnapshot();
    assert.equal(snap.active?.provider, "personal-agent-cloud");
    const openai = snap.connections.find((c) => c.provider === "openai");
    assert.equal(openai?.configStatus, "configured");
    assert.equal(openai?.credentialConfigured, true);
  });
});

describe("PHASE 63 HTTP — no secrets + endpoints", () => {
  it("GET intelligence never returns api keys / tokens", async () => {
    writePersistedProviderApiKey(
      "anthropic",
      "sk-ant-secret-must-not-leak-63",
    );
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/intelligence", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body.includes("sk-ant-secret-must-not-leak-63"), false);
    assert.equal(body.toLowerCase().includes("bearer "), false);
    const json = JSON.parse(body) as {
      connections: Array<{ credentialLabel?: string | null }>;
    };
    const ant = json.connections.find(
      (c: { provider?: string }) =>
        (c as { provider: string }).provider === "anthropic",
    ) as { credentialLabel?: string } | undefined;
    assert.ok(ant);
    assert.equal(ant!.credentialLabel, "API key configurada");
  });

  it("POST providers/:id/disconnect for BYOK", async () => {
    writePersistedProviderApiKey("groq", "gsk_test_disconnect_phase63_xxxx");
    assert.equal(hasProviderApiKeyConfigured("groq"), true);
    const app = new Hono();
    mountSetupHttp(app, { hubToken: HUB });
    const res = await app.request("/v1/setup/providers/groq/disconnect", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 200);
    assert.equal(hasProviderApiKeyConfigured("groq"), false);
    const json = (await res.json()) as {
      connection?: { credentialConfigured?: boolean };
    };
    assert.equal(json.connection?.credentialConfigured, false);
  });

  it("POST providers/:id/test returns human errors without secrets", async () => {
    const app = new Hono();
    mountSetupHttp(app, {
      hubToken: HUB,
      verifyLlm: async () => {
        throw new Error("LLM_AUTH_FAILED invalid key sk-should-not-appear");
      },
    });
    writePersistedProviderApiKey("openai", "sk-test-for-verify-fail-xxxx");
    const res = await app.request("/v1/setup/providers/openai/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(res.status, 400);
    const body = await res.text();
    assert.equal(body.includes("sk-should-not-appear"), false);
    assert.equal(body.includes("sk-test-for-verify-fail-xxxx"), false);
    assert.match(body, /clave|válida|validar|conexión/i);
  });
});

describe("PHASE 63 no fallback + conversation continuity contract", () => {
  it("Cloud/Local/BYOK selection does not invoke other modes", () => {
    const intelSrc = fs.readFileSync(
      path.join(here, "../../src/providers/intelligence.ts"),
      "utf8",
    );
    assert.equal(/fallback|auto.?switch|tryLocal|tryCloud/i.test(intelSrc), false);
    // Router only uses selected connection.
    assert.match(intelSrc, /getIntelligenceConnection/);
  });

  it("provider switch does not touch conversation tables", () => {
    const selectSrc = fs.readFileSync(
      path.join(here, "../../src/providers/intelligence.ts"),
      "utf8",
    );
    const fn = selectSrc.slice(
      selectSrc.indexOf("export function selectIntelligenceConnection"),
      selectSrc.indexOf("export async function upsertExternalConnection"),
    );
    assert.equal(fn.includes("conversations"), false);
    assert.equal(fn.includes("DELETE FROM"), false);
    assert.equal(fn.includes("projects"), false);
  });

  it("redaction still covers BYOK keys in logs", () => {
    const out = redactForLog(
      "apiKey=sk-ant-secret-must-not-leak-63 Authorization: Bearer sess",
    );
    assert.equal(out.includes("sk-ant-secret"), false);
    assert.equal(out.includes("sess"), false);
  });
});
