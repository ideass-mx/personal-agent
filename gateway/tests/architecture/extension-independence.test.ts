import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";

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
  it("Hub src no importa la extensión diagnostics del Node; executionMode solo en tool-policy.ts", () => {
    const policyFile = path.join(repoRoot, "gateway/src/tools/policy.ts");
    for (const file of walkTs(path.join(repoRoot, "gateway/src"))) {
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
    }
    assert.equal(DEFAULT_TOOL_POLICY["diagnostics.ping"], "automatic");
  });

  it("Node READY del Gateway solo después de tools/list", () => {
    const attach = readFileSync(
      path.join(repoRoot, "gateway/src/runtime/attach-node.ts"),
      "utf8",
    );
    const discoverAt = attach.indexOf("registerDiscoveredAgentTools");
    const readyAt = attach.indexOf('status = "READY"');
    assert.ok(discoverAt >= 0 && readyAt > discoverAt);
    const index = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    const attachAt = index.indexOf("attachLocalNode");
    const gatewayReady = index.indexOf("[gateway] READY");
    assert.ok(attachAt >= 0 && gatewayReady > attachAt);
  });
});
