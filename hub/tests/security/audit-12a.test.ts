import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/tool-policy.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp-executor.ts";
import { REMOTE_TOOL_ERROR_CODE } from "../../src/tools/remote.ts";

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

describe("12A Hub: confirmation/MCP fail-closed", () => {
  it("executionMode de write/execute lo decide el Hub, no MCP", () => {
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.write"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["process.execute"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.read"], "automatic");
    const discover = readFileSync(
      path.join(repoRoot, "hub/src/tools/discover.ts"),
      "utf8",
    );
    assert.match(discover, /policy\[tool\.name\]/);
    assert.doesNotMatch(discover, /tool\.executionMode/);
  });

  it("respuesta MCP con requestId ajeno no se acepta; sin retry", async () => {
    let calls = 0;
    const executor = createMcpRemoteExecutor({
      async callTool() {
        calls += 1;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                requestId: "rt_other",
                result: { ok: true, content: { pwned: true } },
              }),
            },
          ],
        };
      },
    });
    const response = await executor.execute({
      requestId: "rt_mine",
      toolName: "filesystem.write",
      input: { path: "x", content: "y" },
      context: { conversationId: "c" },
    });
    assert.equal(calls, 1);
    assert.equal(response.requestId, "rt_mine");
    assert.equal(response.result.ok, false);
    if (!response.result.ok) {
      assert.equal(response.result.error.code, REMOTE_TOOL_ERROR_CODE);
    }
  });

  it("src Hub no introduce Guardian/PermissionManager/retry MCP", () => {
    const mcp = readFileSync(
      path.join(repoRoot, "hub/src/tools/mcp-executor.ts"),
      "utf8",
    );
    assert.doesNotMatch(mcp, /for\s*\(.*retry/);
    assert.match(mcp, /sin retry/);
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /PermissionManager|PolicyEngine|Sandbox|Guardian/, file);
    }
  });
});
