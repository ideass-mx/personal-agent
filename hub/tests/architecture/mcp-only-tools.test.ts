import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

describe("PHASE 2.4 MCP-only tool execution", () => {
  it("el Gateway no registra calculator in-process", () => {
    const index = readFileSync(path.join(repoRoot, "hub/src/index.ts"), "utf8");
    assert.doesNotMatch(index, /calculator/);
    assert.doesNotMatch(index, /tools\.register\(/);
    assert.equal(
      existsSync(path.join(repoRoot, "hub/src/tools/calculator.ts")),
      false,
    );
  });

  it("producción Hub no define Tools ejecutables locales", () => {
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /calculatorTool/, file);
    }
  });

  it("Runtime no nombra calculator ni math.*", () => {
    const src = readFileSync(
      path.join(repoRoot, "hub/src/agent/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /calculator/);
    assert.doesNotMatch(src, /math\.(add|subtract|multiply|divide)/);
  });

  it("policy y MCP Server anuncian math.* (superficie aritmética única)", () => {
    const policy = readFileSync(
      path.join(repoRoot, "hub/src/tools/tool-policy.ts"),
      "utf8",
    );
    assert.match(policy, /"math\.add"/);
    assert.match(policy, /"math\.multiply"/);
    assert.match(policy, /"math\.divide"/);
    const math = readFileSync(
      path.join(repoRoot, "agent/src/tools/math.ts"),
      "utf8",
    );
    assert.match(math, /MATH_MULTIPLY_NAME/);
    assert.match(math, /MATH_DIVIDE_NAME/);
  });

  it("SDK MCP solo en adapters del Hub", () => {
    const allowed = new Set([
      path.join(repoRoot, "hub/src/tools/mcp-stdio.ts"),
      path.join(repoRoot, "hub/src/tools/mcp-executor.ts"),
    ]);
    const hits: string[] = [];
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      if (/@modelcontextprotocol/.test(text) && !allowed.has(file)) {
        hits.push(path.relative(repoRoot, file));
      }
    }
    assert.deepEqual(hits, []);
  });
});
