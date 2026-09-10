import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("updateIntelligenceConnectionModel", () => {
  let tmp: string;
  let prev: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-intel-model-"));
    prev = process.env.PERSONAL_AGENT_DATA_DIR;
    process.env.PERSONAL_AGENT_DATA_DIR = tmp;
    process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
    fs.mkdirSync(path.join(tmp, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "config", "intelligence.json"),
      JSON.stringify(
        {
          selectedConnectionId: "conn_ext_openai",
          connections: [
            {
              id: "conn_local_default",
              mode: "local",
              provider: "local",
              modelId: "qwen3-4b",
              displayName: "Qwen3 4B",
            },
            {
              id: "conn_cloud_default",
              mode: "personal-agent-cloud",
              provider: "personal-agent-cloud",
              modelId: "claude-sonnet-4-6",
              displayName: "Personal Agent Cloud",
            },
            {
              id: "conn_ext_openai",
              mode: "external",
              provider: "openai",
              modelId: "gpt-4.1-mini",
              displayName: "OpenAI",
              credentialRef: "cred_ref_openai",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.mkdirSync(path.join(tmp, "credentials", "llm"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "credentials", "llm", "openai.api_key"),
      "sk-test-openai-key-1234567890",
      "utf8",
    );
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PERSONAL_AGENT_DATA_DIR;
    else process.env.PERSONAL_AGENT_DATA_DIR = prev;
    delete process.env.PERSONAL_AGENT_CREDENTIALS_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("updates BYOK and Cloud Claude models; rejects unknown cloud model", async () => {
    const mod = await import("../../src/providers/intelligence.ts");
    const updated = mod.updateIntelligenceConnectionModel(
      "conn_ext_openai",
      "gpt-4.1",
    );
    assert.equal(updated.modelId, "gpt-4.1");

    const cloud = mod.updateIntelligenceConnectionModel(
      "conn_cloud_default",
      "claude-haiku-4-5-20251001",
    );
    assert.equal(cloud.modelId, "claude-haiku-4-5-20251001");

    const legacy = mod.updateIntelligenceConnectionModel(
      "conn_cloud_default",
      "pa-cloud-default",
    );
    assert.equal(legacy.modelId, "claude-sonnet-4-6");

    assert.throws(
      () =>
        mod.updateIntelligenceConnectionModel(
          "conn_cloud_default",
          "gpt-4.1",
        ),
      /model_not_allowed/,
    );
  });

  it("allows selecting a local catalog model before it is installed", async () => {
    const mod = await import("../../src/providers/intelligence.ts");
    const updated = mod.updateIntelligenceConnectionModel(
      "conn_local_default",
      "qwen3-1.7b",
    );
    assert.equal(updated.modelId, "qwen3-1.7b");
    assert.equal(updated.displayName, "Qwen3 1.7B");
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmp, "config", "intelligence.json"), "utf8"),
    ) as { connections: Array<{ id: string; modelId: string }> };
    const local = cfg.connections.find((c) => c.id === "conn_local_default");
    assert.equal(local?.modelId, "qwen3-1.7b");
  });
});
