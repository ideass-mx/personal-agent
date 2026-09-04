/**
 * Gateway product version /health identity (Fase 7.5).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-buildinfo-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-buildinfo";
process.env.HUB_TOKEN = "d".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_PRODUCT_ROOT = tmp;
process.env.PERSONAL_AGENT_ID = "44444444-4444-4444-8444-444444444444";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, "build-info.json"),
  JSON.stringify({
    product: "personal-agent",
    version: "0.1.0",
    build: "20260904.1",
    commit: "abc1234",
    commitFull: "abc1234fffffff",
    platform: "windows",
    architecture: "x64",
    builtAt: "2026-09-04T15:30:00Z",
    channel: "dev",
  }),
  "utf8",
);

const {
  loadProductBuildInfo,
  resetProductBuildInfoCache,
  productVersionForHealth,
} = await import("../../src/product-version.ts");

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("product-version", () => {
  it("loads build-info from PERSONAL_AGENT_PRODUCT_ROOT", () => {
    resetProductBuildInfoCache();
    const info = loadProductBuildInfo();
    assert.equal(info.version, "0.1.0");
    assert.equal(info.build, "20260904.1");
    assert.equal(info.commit, "abc1234");
    assert.equal(info.platform, "windows");
    const health = productVersionForHealth();
    assert.equal(health.version, "0.1.0");
    assert.equal(JSON.stringify(health).includes("sk-ant"), false);
  });
});
