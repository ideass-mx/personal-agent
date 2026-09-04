import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packagedNodeEntries } from "../../src/runtime/resolve-agent.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 54 canonical Gateway → Node runtime", () => {
  it("packaged spawn candidates: node/node.cjs then legacy agent/agent.cjs only", () => {
    const entries = packagedNodeEntries("/opt/pa/gateway", "linux");
    assert.deepEqual(entries, [
      "/opt/pa/node/node.cjs",
      "/opt/pa/agent/agent.cjs",
    ]);
    assert.equal(entries.some((e) => /node\/agent\.cjs$/.test(e)), false);
  });

  it("index uses attachLocalNode and only [gateway] READY", () => {
    const index = readFileSync(
      path.join(repoRoot, "gateway/src/index.ts"),
      "utf8",
    );
    assert.match(index, /attachLocalNode/);
    assert.match(index, /from ["'].*attach-node\.ts["']/);
    assert.match(index, /\[gateway\] READY/);
    assert.doesNotMatch(index, /\[hub\] READY/);
    assert.doesNotMatch(index, /\[hub\] spawn/);
  });

  it("attach-node exists; attach-agent is re-export only", () => {
    assert.equal(
      existsSync(path.join(repoRoot, "gateway/src/runtime/attach-node.ts")),
      true,
    );
    const legacy = readFileSync(
      path.join(repoRoot, "gateway/src/runtime/attach-agent.ts"),
      "utf8",
    );
    assert.match(legacy, /@deprecated/);
    assert.match(legacy, /attach-node\.ts/);
    assert.doesNotMatch(legacy, /registerDiscoveredAgentTools/);
  });

  it("Desktop prefers gateway/gateway.cjs and [gateway] READY", () => {
    const src = readFileSync(
      path.join(repoRoot, "desktop/lib/agent-process.cjs"),
      "utf8",
    );
    assert.match(src, /gateway["'], ["']gateway\.cjs/);
    assert.match(src, /\[gateway\] READY/);
    assert.ok(src.indexOf("gateway.cjs") < src.indexOf("hub.cjs"));
  });

  it("NodeProcessError is canonical; HubAgentError is alias", () => {
    const errors = readFileSync(
      path.join(repoRoot, "gateway/src/runtime/errors.ts"),
      "utf8",
    );
    assert.match(errors, /class NodeProcessError/);
    assert.match(errors, /HubAgentError = NodeProcessError/);
  });

  it("phase54 doc exists", () => {
    assert.equal(
      existsSync(
        path.join(
          repoRoot,
          "docs/architecture/phase54-canonical-runtime-field-validation.md",
        ),
      ),
      true,
    );
  });
});
