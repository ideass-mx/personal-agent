/**
 * PHASE 62.1 — Provider security matrix + BYOK/Cloud isolation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { redactString } from "../../src/credentials/credential-redactor.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SECRET_MARKERS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "PERSONAL_AGENT_MASTER_KEY",
  "sk-ant-",
  "Bearer ",
];

describe("PHASE 62.1 provider security matrix", () => {
  const matrix = [
    { provider: "Local", apiKeyLocal: "N/A", cloudSeesKey: "N/A" },
    {
      provider: "Personal Agent Cloud",
      apiKeyLocal: "No",
      cloudSeesKey: "No",
    },
    { provider: "OpenAI BYOK", apiKeyLocal: "Yes", cloudSeesKey: "No" },
    { provider: "Anthropic BYOK", apiKeyLocal: "Yes", cloudSeesKey: "No" },
    { provider: "xAI BYOK", apiKeyLocal: "Yes", cloudSeesKey: "No" },
    { provider: "OpenRouter BYOK", apiKeyLocal: "Yes", cloudSeesKey: "No" },
    { provider: "Groq BYOK", apiKeyLocal: "Yes", cloudSeesKey: "No" },
    {
      provider: "OpenAI-compatible",
      apiKeyLocal: "Yes",
      cloudSeesKey: "No",
    },
  ] as const;

  it("documents isolation matrix", () => {
    assert.equal(matrix.length, 8);
    for (const row of matrix) {
      if (row.provider !== "Local" && row.provider !== "Personal Agent Cloud") {
        assert.equal(row.cloudSeesKey, "No");
        assert.equal(row.apiKeyLocal, "Yes");
      }
    }
  });

  it("Cloud provider source does not read BYOK env keys", () => {
    const cloudAuthDir = path.join(root, "src/providers/cloud-auth");
    const files = fs.readdirSync(cloudAuthDir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(cloudAuthDir, f), "utf8");
      assert.equal(src.includes("OPENAI_API_KEY"), false, f);
      assert.equal(src.includes("ANTHROPIC_API_KEY"), false, f);
      assert.equal(src.includes("getEffectiveProviderApiKey"), false, f);
      assert.equal(src.includes("writePersistedProviderApiKey"), false, f);
    }
    const intel = fs.readFileSync(
      path.join(root, "src/providers/intelligence.ts"),
      "utf8",
    );
    // Cloud branch must not pass BYOK key into cloud provider.
    const cloudBlock = intel.slice(
      intel.indexOf('if (c.provider === "personal-agent-cloud")'),
      intel.indexOf('const baseByProvider'),
    );
    assert.equal(cloudBlock.includes("getEffectiveProviderApiKey"), false);
    assert.equal(cloudBlock.includes("OPENAI_API_KEY"), false);
  });

  it("openai-compatible never puts secrets in URL path", () => {
    const src = fs.readFileSync(
      path.join(root, "src/providers/openai-compatible.ts"),
      "utf8",
    );
    assert.match(src, /secrets_in_url_forbidden/);
    assert.equal(src.includes("?api_key="), false);
    assert.equal(src.includes("access_token="), false);
  });

  it("web bundle sources do not embed master provider keys", () => {
    const webRoot = path.join(root, "../web/src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
      }
      return out;
    };
    for (const file of walk(webRoot)) {
      const src = fs.readFileSync(file, "utf8");
      for (const marker of [
        "PERSONAL_AGENT_MASTER_KEY",
        "sk-ant-api",
        "OPENAI_API_KEY=sk-",
      ]) {
        assert.equal(src.includes(marker), false, `${file} ${marker}`);
      }
    }
  });

  it("redaction covers URL secret query forms", () => {
    const out = redactString(
      "https://x/?api_key=sekrit&token=t1&access_token=t2#token=t3",
    );
    assert.equal(out.includes("sekrit"), false);
    assert.equal(out.includes("t1"), false);
    assert.equal(out.includes("t2"), false);
  });

  it("docs phase-62.1 exists", () => {
    const doc = path.join(
      root,
      "../docs/architecture/phase-62.1-cloud-auth.md",
    );
    assert.equal(fs.existsSync(doc), true);
    const text = fs.readFileSync(doc, "utf8");
    assert.match(text, /Cloud Auth Contract/);
    assert.match(text, /DEVICE_REVOKED|CLOUD_AUTH_DEVICE_REVOKED/);
    assert.match(text, /BYOK/);
  });

  void SECRET_MARKERS;
});
