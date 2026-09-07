"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  purgeInstallSecrets,
  llmSecretsPresent,
} = require("../lib/uninstall-secret-cleanup.cjs");
const config = require("../lib/config.cjs");

const issPath = path.join(
  __dirname,
  "..",
  "..",
  "installer",
  "windows",
  "personal-agent.iss",
);

describe("PHASE 58.1 uninstall secret cleanup (Inno)", () => {
  it("always deletes LLM secret paths via PurgeProductSecrets", () => {
    const src = fs.readFileSync(issPath, "utf8");
    assert.match(src, /function InitializeUninstall/);
    assert.match(src, /procedure PurgeProductSecrets/);
    assert.match(src, /ewWaitUntilTerminated/);
    assert.match(src, /userappdata}\\Ideass\\PersonalAgent/);
    const secretsIdx = src.indexOf("config\\secrets.json");
    const llmIdx = src.indexOf("credentials\\llm");
    const msgIdx = src.indexOf("¿Eliminar también conversaciones");
    assert.ok(secretsIdx > 0, "must purge secrets.json");
    assert.ok(llmIdx > 0, "must purge credentials\\llm");
    assert.ok(msgIdx > secretsIdx, "LLM purge before optional data prompt");
    assert.match(src, /workspace NUNCA se borra/i);
  });

  it("credential lifecycle: write → exists → purge → gone → no silent restore path in secrets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pa-llm-cycle-"));
    const prev = process.env.PERSONAL_AGENT_DATA_DIR;
    process.env.PERSONAL_AGENT_DATA_DIR = root;
    try {
      config.setAnthropicApiKey("sk-ant-test-lifecycle-key-zzzz");
      const llmFile = path.join(root, "credentials", "llm", "anthropic.api_key");
      assert.equal(fs.existsSync(llmFile), true);
      assert.equal(fs.readFileSync(llmFile, "utf8").trim(), "sk-ant-test-lifecycle-key-zzzz");
      // Must not keep dual copy in secrets.json
      const secretsPath = path.join(root, "config", "secrets.json");
      if (fs.existsSync(secretsPath)) {
        const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
        assert.equal(secrets.anthropicApiKey, undefined);
      }
      assert.equal(llmSecretsPresent(root), true);
      assert.equal(config.getAnthropicApiKey(), "sk-ant-test-lifecycle-key-zzzz");

      purgeInstallSecrets(root);

      assert.equal(llmSecretsPresent(root), false);
      assert.equal(fs.existsSync(llmFile), false);
      assert.equal(config.getAnthropicApiKey(), "");
      // Conversations DB path must survive secret purge alone.
      fs.mkdirSync(path.join(root, "data"), { recursive: true });
      fs.writeFileSync(path.join(root, "data", "keep.db"), "x");
      purgeInstallSecrets(root);
      assert.equal(fs.existsSync(path.join(root, "data", "keep.db")), true);
    } finally {
      if (prev === undefined) delete process.env.PERSONAL_AGENT_DATA_DIR;
      else process.env.PERSONAL_AGENT_DATA_DIR = prev;
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("main.js clears inherited ANTHROPIC_API_KEY when no persisted key", () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, "..", "main.js"),
      "utf8",
    );
    assert.match(mainSrc, /ANTHROPIC_API_KEY\s*=\s*apiKey\s*\|\|\s*[\"'][\"']/);
    assert.match(mainSrc, /purgeInstallSecrets/);
  });
});
