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

describe("7G frontera Hub ↔ Agent", () => {
  it("AgentRuntime no nombra filesystem.* ni shell", () => {
    const src = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /filesystem\.(read|write|list|delete)/);
    assert.doesNotMatch(src, /process\.execute|process\.run|shell\.execute/);
    assert.doesNotMatch(src, /PermissionManager|Guardian|PolicyEngine/);
    assert.doesNotMatch(src, /@modelcontextprotocol/);
  });

  it("Hub productivo no registra filesystem ni importa node:fs en agent/tools", () => {
    const index = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    assert.doesNotMatch(index, /filesystem\./);
    assert.doesNotMatch(index, /process\.execute/);
    for (const rel of ["gateway/src/agent", "gateway/src/tools"]) {
      for (const file of walkTs(path.join(repoRoot, rel))) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /from ["']node:fs/, file);
        assert.doesNotMatch(text, /from ["']node:child_process/, file);
        assert.doesNotMatch(text, /writeFile\(|readFile\(|readdir\(/, file);
        assert.doesNotMatch(text, /\bspawn\(/, file);
      }
    }
  });

  it("Agent no contiene LLM / Anthropic / AgentRuntime del Hub", () => {
    for (const file of walkTs(path.join(repoRoot, "node/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /@anthropic-ai/, file);
      assert.doesNotMatch(text, /createAgentRuntime/, file);
      assert.doesNotMatch(text, /from ["'].*\/hub\//, file);
    }
  });

  it("Hub no importa AgentExtension ni implementaciones del Agent", () => {
    for (const file of walkTs(path.join(repoRoot, "gateway/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /AgentExtension/, file);
      assert.doesNotMatch(text, /echoExtension/, file);
      assert.doesNotMatch(text, /mathExtension/, file);
      assert.doesNotMatch(text, /systemExtension|systemInfoTool/, file);
      assert.doesNotMatch(text, /diagnosticsExtension|diagnosticsPingTool/, file);
      assert.doesNotMatch(text, /filesystemExtension|createFilesystemExtension/, file);
      assert.doesNotMatch(text, /createProcessExtension/, file);
      assert.doesNotMatch(text, /agent\/src\/extensions/, file);
      assert.doesNotMatch(text, /agent\/src\/tools/, file);
    }
  });

  it("Hub/Agent de producción no importan Guardian ni PermissionManager", () => {
    assert.equal(existsSync(path.join(repoRoot, "node/src/guardian")), false);
    const names = ["PermissionManager", "PolicyEngine", "Sandbox", "Guardian"];
    for (const file of [
      ...walkTs(path.join(repoRoot, "gateway/src")),
      ...walkTs(path.join(repoRoot, "node/src")),
    ]) {
      const text = readFileSync(file, "utf8");
      for (const n of names) {
        assert.doesNotMatch(text, new RegExp(n), `${file} ${n}`);
      }
    }
  });
});
