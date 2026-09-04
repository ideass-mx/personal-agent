/**
 * PHASE 64.1 — packaging gate is wired; no product runtime changes.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("PHASE 64.1 architecture / packaging boundaries", () => {
  it("docs audit + design existen", () => {
    assert.ok(existsSync(path.join(repoRoot, "PHASE_64_1_AUDIT.md")));
    assert.ok(existsSync(path.join(repoRoot, "PHASE_64_1_DESIGN.md")));
    assert.match(read("PHASE_64_1_DESIGN.md"), /windows-latest/);
    assert.match(read("PHASE_64_1_DESIGN.md"), /fail-closed|PE validation/i);
  });

  it("package-windows asserts native modules before return", () => {
    const src = read("scripts/package-windows.mjs");
    assert.match(src, /assertWindowsNativeModules/);
    assert.match(src, /PHASE 64\.1/);
  });

  it("validate-windows-package re-checks natives", () => {
    const src = read("scripts/validate-windows-package.mjs");
    assert.match(src, /validateWindowsNativeModules/);
  });

  it("CI gates natives before Inno", () => {
    const wf = read(".github/workflows/windows-installer.yml");
    assert.match(wf, /PHASE 64\.1/);
    assert.match(wf, /assertWindowsNativeModules/);
    assert.match(wf, /Compile PersonalAgent-Setup/);
    const gateIdx = wf.indexOf("PHASE 64.1");
    const isccIdx = wf.indexOf("Compile PersonalAgent-Setup");
    assert.ok(gateIdx > 0 && isccIdx > gateIdx);
  });

  it("detector lives only in scripts/ (no product imports)", () => {
    const det = read("scripts/windows-native-modules.mjs");
    assert.doesNotMatch(det, /from ["'].*gateway/);
    assert.doesNotMatch(det, /Capability|Artifact|Credential|MCP/);
    assert.doesNotMatch(read("gateway/src/index.ts"), /windows-native-modules/);
  });
});
