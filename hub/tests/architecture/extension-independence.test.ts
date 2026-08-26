import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/tool-policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("11C independencia Agent Extension", () => {
  it("Hub src no importa diagnostics; executionMode solo en tool-policy.ts", () => {
    const policyFile = path.join(repoRoot, "hub/src/tools/tool-policy.ts");
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /agent\/src\/extensions\/diagnostics/, file);
      assert.doesNotMatch(text, /agent\/src\/tools\/diagnostics/, file);
      assert.doesNotMatch(text, /diagnosticsExtension/, file);
      assert.doesNotMatch(text, /diagnosticsPingTool/, file);
      if (path.resolve(file) === path.resolve(policyFile)) {
        assert.match(text, /"diagnostics\.ping": "automatic"/);
        continue;
      }
      assert.doesNotMatch(text, /diagnostics\.ping/, file);
      assert.doesNotMatch(text, /diagnostics/, file);
    }
    assert.equal(DEFAULT_TOOL_POLICY["diagnostics.ping"], "automatic");
  });

  it("Agent READY del Hub solo después de tools/list", () => {
    const attach = readFileSync(
      path.join(repoRoot, "hub/src/runtime/attach-agent.ts"),
      "utf8",
    );
    const discoverAt = attach.indexOf("registerDiscoveredAgentTools");
    const readyAt = attach.indexOf("ready = true");
    assert.ok(discoverAt >= 0 && readyAt > discoverAt);
    const index = readFileSync(path.join(repoRoot, "hub/src/index.ts"), "utf8");
    const attachAt = index.indexOf("attachLocalAgent");
    const hubReady = index.indexOf("[hub] READY");
    assert.ok(attachAt >= 0 && hubReady > attachAt);
  });
});
