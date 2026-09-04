import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAgentFilesystemRoot } from "../../src/runtime/resolve-filesystem-root.ts";
import { childEnvForLocalNode } from "../../src/tools/mcp/stdio.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 48A filesystem root boot propagation", () => {
  it("resolveAgentFilesystemRoot trims and ignores empty", () => {
    assert.equal(resolveAgentFilesystemRoot({}), undefined);
    assert.equal(
      resolveAgentFilesystemRoot({ AGENT_FILESYSTEM_ROOT: "" }),
      undefined,
    );
    assert.equal(
      resolveAgentFilesystemRoot({ AGENT_FILESYSTEM_ROOT: "  " }),
      undefined,
    );
    assert.equal(
      resolveAgentFilesystemRoot({ AGENT_FILESYSTEM_ROOT: " /tmp/ws " }),
      "/tmp/ws",
    );
  });

  it("childEnv overlay delivers AGENT_FILESYSTEM_ROOT to Node env", () => {
    const root = "/tmp/pa-48a-ws";
    const env = childEnvForLocalNode({ AGENT_FILESYSTEM_ROOT: root });
    assert.equal(env.AGENT_FILESYSTEM_ROOT, root);
    assert.equal("HUB_TOKEN" in env, false);
    assert.equal("ANTHROPIC_API_KEY" in env, false);
  });

  it("boot path passes filesystemRoot from env to attachLocalNode", () => {
    const index = readFileSync(
      path.join(repoRoot, "gateway/src/index.ts"),
      "utf8",
    );
    assert.match(index, /dotenv\/config/);
    assert.match(index, /resolveAgentFilesystemRoot/);
    assert.match(index, /filesystemRoot/);
    assert.match(index, /attachLocalNode\(\{[\s\S]*filesystemRoot/);
  });

  it("legacy empty root remains optional (no fail-fast in resolve)", () => {
    assert.equal(resolveAgentFilesystemRoot({ AGENT_FILESYSTEM_ROOT: undefined }), undefined);
  });
});
