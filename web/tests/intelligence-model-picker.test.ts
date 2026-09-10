import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("intelligence model management UX", () => {
  it("Local/BYOK/Cloud pick models; Cloud uses Claude without API key", () => {
    const center = readFileSync(
      join(root, "src/features/configuration/IntelligenceCenter.tsx"),
      "utf8",
    );
    assert.match(center, /IntelligenceModelSection/);
    assert.match(center, /updateIntelligenceConnectionModel/);
    assert.match(center, /onPickLocalModel/);
    assert.match(center, /onPickCloudModel/);
    assert.match(center, /byokModelOptions\("personal-agent-cloud"\)/);
    assert.match(center, /Claude en la nube, sin API key/);
    assert.doesNotMatch(center, /Seleccionado por Personal Agent/);
    assert.match(center, /installLocalModel/);
    assert.match(center, /Instalar modelo/);
  });

  it("local catalog offers 4B / 1.7B / 0.6B", () => {
    const catalog = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../gateway/src/local-llm/catalog.ts",
      ),
      "utf8",
    );
    assert.match(catalog, /qwen3-4b/);
    assert.match(catalog, /qwen3-1\.7b/);
    assert.match(catalog, /qwen3-0\.6b/);
  });

  it("gateway allows Cloud Claude model updates", () => {
    const intel = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../gateway/src/providers/intelligence.ts",
      ),
      "utf8",
    );
    assert.match(intel, /updateIntelligenceConnectionModel/);
    assert.match(intel, /isPersonalAgentCloudModel/);
    assert.doesNotMatch(intel, /cloud_model_managed/);
    const http = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../gateway/src/http/setup-http.ts",
      ),
      "utf8",
    );
    assert.match(http, /\/v1\/setup\/intelligence\/model/);
    assert.match(http, /model_not_allowed/);
  });
});
