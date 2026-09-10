import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("gemini BYOK provider", () => {
  let tmp: string;
  let prevData: string | undefined;
  let prevCred: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-gemini-"));
    prevData = process.env.PERSONAL_AGENT_DATA_DIR;
    prevCred = process.env.PERSONAL_AGENT_CREDENTIALS_DIR;
    process.env.PERSONAL_AGENT_DATA_DIR = tmp;
    process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
  });

  afterEach(() => {
    if (prevData === undefined) delete process.env.PERSONAL_AGENT_DATA_DIR;
    else process.env.PERSONAL_AGENT_DATA_DIR = prevData;
    if (prevCred === undefined) delete process.env.PERSONAL_AGENT_CREDENTIALS_DIR;
    else process.env.PERSONAL_AGENT_CREDENTIALS_DIR = prevCred;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("registers gemini and upserts with Google OpenAI-compat base URL", async () => {
    const registry = await import("../../src/providers/registry.ts");
    assert.ok(registry.isProviderAvailable("gemini"));
    assert.equal(
      registry.getProviderDescriptor("gemini")?.name,
      "Gemini",
    );

    const intel = await import("../../src/providers/intelligence.ts");
    const conn = await intel.upsertExternalConnection({
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      apiKey: "AIzaSyTestGeminiKeyForUnitXXXXXXXX",
    });
    assert.equal(conn.provider, "gemini");
    assert.equal(conn.modelId, "gemini-2.5-flash");
    assert.match(
      conn.baseUrl || "",
      /generativelanguage\.googleapis\.com\/v1beta\/openai/,
    );

    const snap = intel.getIntelligenceStatusSnapshot();
    assert.ok(snap.connections.some((c) => c.provider === "gemini"));
  });
});
