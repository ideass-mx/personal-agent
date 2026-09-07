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

const issPath = path.join(
  __dirname,
  "..",
  "..",
  "installer",
  "windows",
  "personal-agent.iss",
);

describe("PHASE 58 uninstall secret cleanup (Inno)", () => {
  it("always deletes LLM secret paths (not only optional data wipe)", () => {
    const src = fs.readFileSync(issPath, "utf8");
    assert.match(src, /function InitializeUninstall/);
    // Mandatory LLM / install secret cleanup appears before optional MsgBox data wipe.
    const secretsIdx = src.indexOf(
      "DeleteFile(ExpandConstant('{localappdata}\\Ideass\\PersonalAgent\\config\\secrets.json'))",
    );
    const llmIdx = src.indexOf(
      "DelTree(ExpandConstant('{localappdata}\\Ideass\\PersonalAgent\\credentials\\llm')",
    );
    const credIdx = src.indexOf(
      "DelTree(ExpandConstant('{localappdata}\\Ideass\\PersonalAgent\\credentials')",
    );
    const msgIdx = src.indexOf("¿Eliminar también conversaciones");
    assert.ok(secretsIdx > 0, "must DeleteFile secrets.json");
    assert.ok(llmIdx > 0, "must DelTree credentials\\llm");
    assert.ok(credIdx > 0, "must DelTree credentials");
    assert.ok(msgIdx > secretsIdx, "LLM purge must run before optional data prompt");
    assert.ok(msgIdx > llmIdx, "llm dir purge before optional prompt");
    assert.match(src, /workspace NUNCA se borra/i);
  });

  it("purgeInstallSecrets removes anthropic key from secrets.json and credentials/llm", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pa-uninstall-llm-"));
    const configDir = path.join(root, "config");
    const llmDir = path.join(root, "credentials", "llm");
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(llmDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "secrets.json"),
      JSON.stringify({
        hubToken: "h".repeat(32),
        anthropicApiKey: "sk-ant-test-should-not-survive",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(llmDir, "anthropic.api_key"),
      "sk-ant-test-file-key",
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "credentials", "anthropic.api_key"),
      "sk-ant-legacy-key",
      "utf8",
    );
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "keep.db"), "sqlite-placeholder");

    assert.equal(llmSecretsPresent(root), true);
    purgeInstallSecrets(root);
    assert.equal(llmSecretsPresent(root), false);
    assert.equal(fs.existsSync(path.join(root, "config", "secrets.json")), false);
    assert.equal(fs.existsSync(path.join(root, "credentials")), false);
    // Conversations DB path must not be deleted by secret purge alone.
    assert.equal(fs.existsSync(path.join(root, "data", "keep.db")), true);
  });
});
