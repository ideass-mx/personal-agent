import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(agentRoot, "..");

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

describe("frontera Hub ↔ Agent", () => {
  it("no existe paquete ni carpeta guardian/", () => {
    assert.equal(existsSync(path.join(repoRoot, "guardian")), false);
    assert.equal(existsSync(path.join(agentRoot, "src/guardian")), false);
  });

  it("Agent no importa Hub", () => {
    for (const file of walkTs(path.join(agentRoot, "src"))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /from ["'].*\/hub\//);
    }
  });

  it("tools/ y extensions/ no importan AgentRuntime, confirmation ni LLM del Hub", () => {
    const dirs = [
      path.join(agentRoot, "src/tools"),
      path.join(agentRoot, "src/extensions"),
    ];
    for (const dir of dirs) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /createAgentRuntime/, file);
        assert.doesNotMatch(text, /confirm_request|ConfirmationWaiter/, file);
        assert.doesNotMatch(text, /createRemoteAgentTool/, file);
        assert.doesNotMatch(text, /createMcpRemoteExecutor/, file);
        assert.doesNotMatch(text, /@anthropic-ai/, file);
        assert.doesNotMatch(text, /LLMProvider/, file);
        assert.doesNotMatch(text, /from ["'].*\/hub\//, file);
        assert.doesNotMatch(text, /from ["']@anthropic-ai/, file);
      }
    }
  });

  it("AgentRuntime no importa MCP ni el proceso Agent", () => {
    const runtime = readFileSync(
      path.join(repoRoot, "hub/src/agent/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtime, /@modelcontextprotocol/);
    assert.doesNotMatch(runtime, /from ["'].*\/agent\/src\//);
  });
});
