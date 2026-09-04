/**
 * PHASE 63.1 — semántica: dimensiones independientes (sin routing).
 *
 * Fixtures arquitectónicos viven en este test (no en gateway/src) para no
 * contaminar boundaries de Office / producción con IDs de ejemplo.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCapabilityId,
  createCapabilityIndex,
  GATEWAY_TARGET_ID,
  LOCAL_NODE_TARGET_ID,
  markLocalNodeUnavailable,
  syncLocalNodeCapabilities,
  type ToolImplementation,
} from "../../src/capabilities/index.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

/** Example A: native on Gateway (in-process). */
const FIXTURE_A: ToolImplementation = Object.freeze({
  capabilityId: "artifact.metadata",
  toolName: "artifact.metadata",
  executionTargetId: GATEWAY_TARGET_ID,
  implementationKind: "native",
  transport: "in-process",
});

/** Example B: native Excel on Node-B via MCP/stdio. */
const FIXTURE_B: ToolImplementation = Object.freeze({
  capabilityId: "office.excel.write",
  toolName: "office.excel.write",
  executionTargetId: "node-b",
  implementationKind: "native",
  transport: "mcp/stdio",
});

/** Example C: MCP implementation on non-Node remote target. */
const FIXTURE_C: ToolImplementation = Object.freeze({
  capabilityId: "external.search",
  toolName: "external.search",
  executionTargetId: "remote-mcp",
  implementationKind: "mcp",
  transport: "mcp/http",
});

/** Example D: native GPU on Node-C; transport futuro no implementado. */
const FIXTURE_D: ToolImplementation = Object.freeze({
  capabilityId: "gpu.inference",
  toolName: "gpu.inference",
  executionTargetId: "node-c",
  implementationKind: "native",
  transport: "future-remote",
});

const SEMANTIC_FIXTURES = [FIXTURE_A, FIXTURE_B, FIXTURE_C, FIXTURE_D] as const;

describe("PHASE 63.1 capability semantics", () => {
  it("docs audit + design existen con matriz canónica", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_63_1_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_63_1_DESIGN.md")));
    const design = read("PHASE_63_1_DESIGN.md");
    assert.ok(design.includes("native ≠ Gateway"));
    assert.ok(design.includes("MCP ≠ Node"));
    assert.ok(design.includes("remote ≠ transport"));
    assert.ok(design.includes("Capability ≠ execution target"));
    assert.match(design, /\| Capability\s+\|/);
    assert.match(design, /\| Implementation\s+\|/);
    assert.match(design, /\| ExecutionTarget\s+\|/);
    assert.match(design, /\| Transport\s+\|/);
  });

  it("Test 1: native implementation can target Gateway", () => {
    const index = createCapabilityIndex();
    index.upsertTarget({
      id: GATEWAY_TARGET_ID,
      kind: "gateway",
      status: "available",
    });
    index.registerImplementation(FIXTURE_A);
    const impls = index.resolve("artifact.metadata");
    assert.equal(impls.length, 1);
    assert.equal(impls[0]!.implementationKind, "native");
    assert.equal(impls[0]!.executionTargetId, GATEWAY_TARGET_ID);
    assert.equal(impls[0]!.transport, "in-process");
    const target = index.listTargets().find((t) => t.id === GATEWAY_TARGET_ID);
    assert.equal(target!.kind, "gateway");
  });

  it("Test 2: native implementation can target Node", () => {
    const index = createCapabilityIndex();
    index.upsertTarget({ id: "node-b", kind: "node", status: "available" });
    index.registerImplementation(FIXTURE_B);
    const impls = index.resolve("office.excel.write");
    assert.equal(impls[0]!.implementationKind, "native");
    assert.equal(impls[0]!.executionTargetId, "node-b");
    assert.equal(impls[0]!.transport, "mcp/stdio");
  });

  it("Test 3: MCP implementation can target non-Node execution target", () => {
    const index = createCapabilityIndex();
    index.upsertTarget({
      id: "remote-mcp",
      kind: "remote",
      status: "available",
    });
    index.registerImplementation(FIXTURE_C);
    const impls = index.resolve("external.search");
    assert.equal(impls.length, 1);
    assert.equal(impls[0]!.implementationKind, "mcp");
    assert.equal(impls[0]!.executionTargetId, "remote-mcp");
    const target = index.listTargets().find((t) => t.id === "remote-mcp");
    assert.equal(target!.kind, "remote");
    assert.notEqual(target!.kind, "node");
  });

  it("Test 4: CapabilityId contains no execution-target identity", () => {
    assert.equal(assertCapabilityId("office.excel.write"), "office.excel.write");
    assert.throws(() => assertCapabilityId("node-b.office.excel.write"));
    assert.throws(() => assertCapabilityId("gateway.artifact.metadata"));
    assert.throws(() => assertCapabilityId("remote-mcp.external.search"));
    assert.throws(() => assertCapabilityId("node-b:office.excel.write"));
  });

  it("Test 5: CapabilityId contains no transport", () => {
    assert.throws(() => assertCapabilityId("mcp.office.excel.write"));
    assert.throws(() => assertCapabilityId("stdio.filesystem.read"));
    assert.throws(() => assertCapabilityId("http.external.search"));
    assert.throws(() => assertCapabilityId("in-process.artifact.metadata"));
  });

  it("Test 6: AgentDefinition does not reference Nodes", () => {
    const def = read("gateway/src/agents/definition.ts");
    assert.match(def, /enabledTools/);
    assert.doesNotMatch(def, /enabledNodes/);
    assert.doesNotMatch(def, /node-local|node-a|LOCAL_NODE_TARGET/);
    assert.doesNotMatch(def, /executionTarget|stdio|mcp\/stdio/i);
    assert.match(def, /capability identities|CapabilityId|PHASE 63/i);
  });

  it("Test 7: one capability can have multiple implementations", () => {
    const index = createCapabilityIndex();
    index.upsertTarget({ id: "node-a", kind: "node", status: "available" });
    index.upsertTarget({ id: "node-b", kind: "node", status: "available" });
    index.registerImplementation({
      ...FIXTURE_B,
      executionTargetId: "node-a",
    });
    index.registerImplementation(FIXTURE_B);
    const impls = index.resolve("office.excel.write");
    assert.equal(impls.length, 2);
    assert.deepEqual(
      impls.map((i) => i.executionTargetId).sort(),
      ["node-a", "node-b"],
    );
    assert.ok(impls.every((i) => i.implementationKind === "native"));
  });

  it("Test 8: Node disconnect does not delete logical Capability", () => {
    const index = createCapabilityIndex();
    syncLocalNodeCapabilities(index, [{ name: "filesystem.read" }]);
    assert.equal(
      index.resolve("filesystem.read")[0]!.implementationKind,
      "native",
    );
    markLocalNodeUnavailable(index);
    assert.ok(index.hasDescriptor("filesystem.read"));
    assert.equal(index.resolve("filesystem.read").length, 0);
    const t = index.listTargets().find((x) => x.id === LOCAL_NODE_TARGET_ID);
    assert.equal(t!.status, "unavailable");
  });

  it("Test 9: ArtifactReference does not expose ExecutionTarget", () => {
    const art = read("gateway/src/artifacts/types.ts");
    assert.doesNotMatch(art, /ExecutionTarget|executionTargetId|node-local/);
    assert.doesNotMatch(art, /from ["'].*capabilities/);
    assert.doesNotMatch(art, /implementationKind/);
  });

  it("Test 10: ObjectStorage does not depend on capability/execution concepts", () => {
    const storage = read("gateway/src/storage/types.ts");
    assert.doesNotMatch(storage, /CapabilityIndex|ExecutionTarget|implementationKind/);
    assert.doesNotMatch(storage, /from ["'].*capabilities/);
    assert.doesNotMatch(storage, /from ["'].*agents/);
  });

  it("forbidden equivalences are documented and fixtures contradict them", () => {
    const design = read("PHASE_63_1_DESIGN.md");
    assert.ok(design.includes("native ≠ Gateway"));
    assert.ok(design.includes("MCP ≠ Node"));
    assert.ok(design.includes("remote ≠ transport"));
    assert.ok(design.includes("Capability ≠ execution target"));

    assert.equal(FIXTURE_B.implementationKind, "native");
    assert.notEqual(FIXTURE_B.executionTargetId, GATEWAY_TARGET_ID);

    assert.equal(FIXTURE_C.implementationKind, "mcp");
    assert.notEqual(FIXTURE_C.executionTargetId, LOCAL_NODE_TARGET_ID);

    assert.equal(FIXTURE_D.implementationKind, "native");
    assert.equal(FIXTURE_D.transport, "future-remote");

    assert.equal(FIXTURE_A.capabilityId, "artifact.metadata");
    assert.notEqual(FIXTURE_A.implementationKind, FIXTURE_C.implementationKind);

    assert.equal(SEMANTIC_FIXTURES.length, 4);
  });

  it("current local sync: native on node-local via mcp/stdio (not native=Gateway)", () => {
    const index = createCapabilityIndex();
    syncLocalNodeCapabilities(index, [{ name: "filesystem.read" }]);
    const impl = index.resolve("filesystem.read")[0]!;
    assert.equal(impl.implementationKind, "native");
    assert.equal(impl.executionTargetId, LOCAL_NODE_TARGET_ID);
    assert.equal(impl.transport, "mcp/stdio");
    assert.notEqual(impl.executionTargetId, GATEWAY_TARGET_ID);
  });

  it("Gateway coordinates Agents; not universal tool host (docs + no router)", () => {
    const design = read("PHASE_63_1_DESIGN.md");
    assert.match(design, /Agent Runtime \/ coordinación|coordinación/);
    assert.match(design, /Universal Tool Host/);
    assert.doesNotMatch(design, /Control Plane/i);
    const indexSrc = read("gateway/src/capabilities/capability-index.ts");
    assert.doesNotMatch(indexSrc, /load.?balanc|failover|affinity|best.?impl|schedul/i);
    assert.match(indexSrc, /No enruta/);
  });
});
