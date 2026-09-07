/**
 * PHASE 57.5/57.6 — Tool Safety is authoritative; CapabilityExecutor is backstop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateToolSafety } from "../../src/tools/safety.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("Tool Safety authoritative vs CapabilityExecutor backstop", () => {
  it("AgentRuntime evaluates policy before HITL/execute", () => {
    const runtime = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.match(runtime, /evaluateToolSafety/);
    const evalIdx = runtime.indexOf("evaluateToolSafety");
    const confirmIdx = runtime.indexOf("CONFIRMATION_REQUIRED");
    const executeIdx = runtime.indexOf("tool.execute(");
    assert.ok(evalIdx > 0);
    assert.ok(confirmIdx > evalIdx);
    assert.ok(executeIdx > evalIdx);
  });

  it("CapabilityExecutor only mirrors deny-by-omission; does not invent ALLOW", () => {
    const executor = readFileSync(
      path.join(repoRoot, "gateway/src/capabilities/executor.ts"),
      "utf8",
    );
    assert.match(executor, /policy\[capabilityId\] === undefined/);
    assert.doesNotMatch(executor, /evaluateToolSafety/);
    // Confirm tools are still in policy (executor does not skip confirm).
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.write"], "confirm");
    const ev = evaluateToolSafety({
      toolName: "filesystem.write",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "confirm",
    });
    assert.equal(ev.decision, "CONFIRMATION_REQUIRED");
  });
});
