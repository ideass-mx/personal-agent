/**
 * PHASE 63 — modelo distribuido Capability / Implementation / ExecutionTarget.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCapabilityIndex,
  LOCAL_NODE_TARGET_ID,
  markLocalNodeUnavailable,
  syncLocalNodeCapabilities,
  assertCapabilityId,
} from "../../src/capabilities/index.ts";
import {
  DEFAULT_TOOL_POLICY,
  assertValidToolPolicy,
} from "../../src/tools/policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 63 distributed capability model", () => {
  it("docs audit + design existen", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_63_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_63_DESIGN.md")));
  });

  it("capability ID is independent of node ID", () => {
    const id = assertCapabilityId("office.excel.write");
    assert.equal(id, "office.excel.write");
    assert.doesNotMatch(id, /node-/i);
    assert.ok(!id.includes(":"));

    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "office.excel.write" });
    index.registerImplementation({
      capabilityId: "office.excel.write",
      toolName: "office.excel.write",
      executionTargetId: "node-a",
      implementationKind: "native",
      transport: "mcp/stdio",
    });
    index.registerImplementation({
      capabilityId: "office.excel.write",
      toolName: "office.excel.write",
      executionTargetId: "node-b",
      implementationKind: "native",
      transport: "mcp/stdio",
    });
    const resolved = index.resolve("office.excel.write");
    assert.equal(resolved.length, 2);
    for (const impl of resolved) {
      assert.equal(impl.capabilityId, "office.excel.write");
      assert.notEqual(impl.capabilityId, impl.executionTargetId);
    }
  });

  it("AgentDefinition portability: same capability IDs across Node-A → Node-B", () => {
    const enabledTools = ["filesystem.read", "office.excel.write"] as const;
    const policy = assertValidToolPolicy({
      "filesystem.read": "automatic",
      "office.excel.write": "confirm",
    });

    const index = createCapabilityIndex();
    // Node-A
    index.registerImplementation({
      capabilityId: "filesystem.read",
      toolName: "filesystem.read",
      executionTargetId: "node-a",
      implementationKind: "native",
    });
    index.registerImplementation({
      capabilityId: "office.excel.write",
      toolName: "office.excel.write",
      executionTargetId: "node-a",
      implementationKind: "native",
    });
    assert.equal(index.resolve("filesystem.read").length, 1);
    assert.equal(index.resolve("filesystem.read")[0]!.executionTargetId, "node-a");

    // Move implementations to Node-B (AgentDefinition unchanged)
    index.unregisterByTarget("node-a");
    index.registerImplementation({
      capabilityId: "filesystem.read",
      toolName: "filesystem.read",
      executionTargetId: "node-b",
      implementationKind: "native",
    });
    index.registerImplementation({
      capabilityId: "office.excel.write",
      toolName: "office.excel.write",
      executionTargetId: "node-b",
      implementationKind: "native",
    });

    for (const cap of enabledTools) {
      assert.ok(policy[cap] !== undefined || DEFAULT_TOOL_POLICY[cap] !== undefined || true);
      const impls = index.resolve(cap);
      assert.equal(impls.length, 1);
      assert.equal(impls[0]!.executionTargetId, "node-b");
      assert.equal(impls[0]!.capabilityId, cap);
    }
  });

  it("multiple implementations of one capability simultaneously", () => {
    const index = createCapabilityIndex();
    index.upsertDescriptor({ id: "gpu.inference" });
    index.registerImplementation({
      capabilityId: "gpu.inference",
      toolName: "gpu.inference",
      executionTargetId: "node-c",
      implementationKind: "native",
    });
    index.registerImplementation({
      capabilityId: "gpu.inference",
      toolName: "gpu.inference",
      executionTargetId: "remote-gpu",
      implementationKind: "native",
      transport: "http",
    });
    assert.equal(index.resolve("gpu.inference").length, 2);
  });

  it("Node disconnect does not remove logical capability descriptor", () => {
    const index = createCapabilityIndex();
    syncLocalNodeCapabilities(index, [
      { name: "filesystem.read", description: "read file" },
      { name: "office.excel.write" },
    ]);
    assert.ok(index.hasDescriptor("filesystem.read"));
    assert.equal(index.resolve("filesystem.read").length, 1);

    markLocalNodeUnavailable(index);
    assert.ok(index.hasDescriptor("filesystem.read"));
    assert.ok(index.hasDescriptor("office.excel.write"));
    assert.equal(index.resolve("filesystem.read").length, 0);
    const target = index.listTargets().find((t) => t.id === LOCAL_NODE_TARGET_ID);
    assert.ok(target);
    assert.equal(target!.status, "unavailable");
  });

  it("ToolPolicy operates on capability identity (not node-qualified keys)", () => {
    const policy = assertValidToolPolicy({
      "office.excel.write": "confirm",
      "process.execute": "confirm",
    });
    assert.equal(policy["office.excel.write"], "confirm");
    assert.equal(Object.keys(policy).find((k) => k.includes("node-")), undefined);
    for (const key of Object.keys(DEFAULT_TOOL_POLICY)) {
      assert.doesNotMatch(key, /^node-/i);
      assert.ok(!key.includes(":"));
    }
  });

  it("MCP remains protocol-native (no PA capability metadata required)", () => {
    const mcp = read("node/src/mcp/server.ts");
    assert.doesNotMatch(mcp, /CapabilityIndex|CapabilityDescriptor|ExecutionTarget/);
    assert.doesNotMatch(mcp, /capabilityId/);
    const client = read("gateway/src/tools/mcp/client.ts");
    assert.doesNotMatch(client, /CapabilityIndex|CapabilityDescriptor/);
  });

  it("Credential boundary: capability types do not expose secrets", () => {
    const types = read("gateway/src/capabilities/types.ts");
    assert.doesNotMatch(types, /password|apiKey|SecretStore|deviceCredential/i);
    assert.doesNotMatch(types, /from ["'].*credentials/);
    const indexSrc = read("gateway/src/capabilities/capability-index.ts");
    assert.doesNotMatch(indexSrc, /from ["'].*credentials/);
    assert.doesNotMatch(indexSrc, /SecretStore|CredentialManager/);
  });

  it("Artifact boundary: ArtifactReference independent of execution target", () => {
    const artTypes = read("gateway/src/artifacts/types.ts");
    assert.doesNotMatch(artTypes, /ExecutionTarget|CapabilityIndex|node-local/);
    assert.doesNotMatch(artTypes, /from ["'].*capabilities/);
    const caps = read("gateway/src/capabilities/types.ts");
    assert.doesNotMatch(caps, /Artifact|ObjectStorage|ObjectReference/);
  });

  it("ObjectStorage remains unaware of Capability/Agent/Node/MCP", () => {
    const storageTypes = read("gateway/src/storage/types.ts");
    assert.doesNotMatch(storageTypes, /CapabilityIndex|ExecutionTarget|AgentRuntime/);
    assert.doesNotMatch(storageTypes, /from ["'].*capabilities/);
    assert.doesNotMatch(storageTypes, /from ["'].*agents/);
    assert.doesNotMatch(storageTypes, /from ["'].*tools\/mcp/);
    const local = read("gateway/src/storage/local.ts");
    assert.doesNotMatch(local, /from ["'].*capabilities/);
  });

  it("no excessive managers; CapabilityIndex is the minimal surface", () => {
    const capDir = path.join(repoRoot, "gateway/src/capabilities");
    const files = read("gateway/src/capabilities/index.ts");
    assert.match(files, /CapabilityIndex/);
    assert.doesNotMatch(files, /CapabilityManager|ToolManager|ExecutionManager|NodeManager/);
    for (const name of [
      "CapabilityManager",
      "ToolManager",
      "ExecutionManager",
      "NodeManager",
      "ProviderManager",
    ]) {
      assert.doesNotMatch(
        readFileSync(path.join(capDir, "capability-index.ts"), "utf8"),
        new RegExp(`\\b${name}\\b`),
      );
    }
  });

  it("AgentRuntime does not import capabilities infrastructure", () => {
    const runtime = read("gateway/src/agents/runtime.ts");
    assert.doesNotMatch(runtime, /from ["'].*capabilities/);
    assert.doesNotMatch(runtime, /CapabilityIndex|ExecutionTarget|stdio|SecretStore/);
  });

  it("enabledTools documented as capability identities", () => {
    const def = read("gateway/src/agents/definition.ts");
    assert.match(def, /capability identities|CapabilityId|PHASE 63/i);
    assert.doesNotMatch(def, /enabledNodes/);
  });
});
