/**
 * PHASE 59 — Tool Safety matrix para filesystem.search/delete.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";
import { evaluateToolSafety } from "../../src/tools/safety.ts";

describe("PHASE 59 tool safety matrix", () => {
  it("search/list/read → ALLOWED; write/delete/execute → CONFIRMATION_REQUIRED", () => {
    const cases: Array<[string, string]> = [
      ["filesystem.search", "ALLOWED"],
      ["filesystem.list", "ALLOWED"],
      ["filesystem.read", "ALLOWED"],
      ["filesystem.write", "CONFIRMATION_REQUIRED"],
      ["filesystem.delete", "CONFIRMATION_REQUIRED"],
      ["process.execute", "CONFIRMATION_REQUIRED"],
    ];
    for (const [tool, expected] of cases) {
      const ev = evaluateToolSafety({
        toolName: tool,
        policy: DEFAULT_TOOL_POLICY,
        executionMode: DEFAULT_TOOL_POLICY[tool],
      });
      assert.equal(ev.decision, expected, tool);
    }
  });

  it("unknown tool → DENIED (sin bypass filesystem)", () => {
    const ev = evaluateToolSafety({
      toolName: "filesystem.format_disk",
      policy: DEFAULT_TOOL_POLICY,
    });
    assert.equal(ev.decision, "DENIED");
  });

  it("DEFAULT_TOOL_POLICY incluye search y delete", () => {
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.search"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.delete"], "confirm");
  });
});
