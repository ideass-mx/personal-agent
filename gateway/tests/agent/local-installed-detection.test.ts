/**
 * Local installed sin active explícito debe contar como configurado.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-local-installed-"));
process.env.HUB_TOKEN = "z".repeat(32);
process.env.PERSONAL_AGENT_DATA_DIR = tmp;
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { createLocalModelManager } = await import("../../src/local-llm/manager.ts");
const { isLocalLlmConfigured } = await import("../../src/local-llm/selection.ts");
const {
  ensureModelStorageDirs,
  resolveModelStorage,
} = await import("../../src/local-llm/storage.ts");
const { localAvailabilitySummary } = await import(
  "../../src/providers/intelligence.ts"
);

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("local model installed detection", () => {
  it("installed file without active is configured and auto-activates", () => {
    const paths = ensureModelStorageDirs(resolveModelStorage());
    const fake = path.join(
      paths.modelsDir,
      "qwen3-4b",
      "q4_k_m",
      "model.gguf",
    );
    fs.mkdirSync(path.dirname(fake), { recursive: true });
    fs.writeFileSync(fake, "gguf-mock");
    fs.writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          version: 1,
          active: null,
          installed: [
            {
              modelId: "qwen3-4b",
              variantId: "q4_k_m",
              path: fake,
              sha256: "deadbeef",
              installedAt: new Date().toISOString(),
            },
          ],
        },
        null,
        2,
      ),
    );

    const manager = createLocalModelManager(paths);
    assert.equal(isLocalLlmConfigured(manager), true);
    const active = manager.getActive();
    assert.ok(active);
    assert.equal(active?.modelId, "qwen3-4b");
    const persisted = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as {
      active: { modelId: string } | null;
    };
    assert.equal(persisted.active?.modelId, "qwen3-4b");
    assert.equal(localAvailabilitySummary().installed, true);
  });
});
