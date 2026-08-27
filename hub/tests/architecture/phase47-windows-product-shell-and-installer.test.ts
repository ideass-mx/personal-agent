import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

describe("PHASE 47 Windows product shell & installer definition", () => {
  it("docs CLOSED; READY FOR IMPLEMENTATION; productive NONE; designed not tested", () => {
    const doc = read(
      "docs/architecture/phase47-windows-product-shell-and-installer.md",
    );
    assert.match(doc, /PHASE 47 CLOSED/);
    assert.match(doc, /READY FOR IMPLEMENTATION/);
    assert.match(doc, /Productive code changed[\s\S]*NONE|NONE/);
    assert.match(doc, /\*\*designed\*\*/);
    assert.match(doc, /not implemented|not Windows tested|not field tested/i);
    assert.match(doc, /Architecture Changes[\s\S]*NONE/);
  });

  it("defines installer, Desktop Shell, first-run, READY, recovery, uninstall", () => {
    const doc = read(
      "docs/architecture/phase47-windows-product-shell-and-installer.md",
    );
    assert.match(doc, /Installer responsibilities|Installer/);
    assert.match(doc, /Desktop Shell/);
    assert.match(doc, /First-run|FIRST RUN/);
    assert.match(doc, /AGENT READY|AGENT_FILESYSTEM_ROOT/);
    assert.match(doc, /Recovery matrix/);
    assert.match(doc, /Uninstall/);
    assert.match(doc, /Android pairing/);
  });

  it("preserves security boundaries; Shell is not a Runtime", () => {
    const doc = read(
      "docs/architecture/phase47-windows-product-shell-and-installer.md",
    );
    assert.match(doc, /ConfirmationWaiter|toolPolicy/);
    assert.match(doc, /No introducir[\s\S]*User\/ACL|sin User\/ACL|User\/ACL/i);
    assert.match(doc, /no es un segundo Runtime|Shell ≠ Runtime|no es un segundo Runtime/i);
    assert.doesNotMatch(doc, /IMPLEMENTED.*ConfirmationWaiter/);
  });

  it("documents E-47-01 FS root attach debt; PHASE 48A wires boot path", () => {
    const doc = read(
      "docs/architecture/phase47-windows-product-shell-and-installer.md",
    );
    assert.match(doc, /E-47-01/);
    assert.match(doc, /filesystemRoot|AGENT_FILESYSTEM_ROOT/);
    const index = read("hub/src/index.ts");
    assert.match(index, /filesystemRoot/);
    assert.match(index, /resolveAgentFilesystemRoot/);
  });

  it("technology choice documented; no Electron Agent Runtime confusion", () => {
    const doc = read(
      "docs/architecture/phase47-windows-product-shell-and-installer.md",
    );
    assert.match(doc, /Inno Setup|NSIS/);
    assert.match(doc, /Electron|Tauri/);
    assert.match(doc, /Node 22 portable|portable/);
  });

  it("field test not claimed; maps to PHASE 48 implementation", () => {
    const doc = read(
      "docs/architecture/phase47-windows-product-shell-and-installer.md",
    );
    assert.match(doc, /No declara|not field tested|PHASE 48/);
    assert.match(doc, /48A|48B|48C/);
    const boundaries = read("docs/architecture/boundaries.md");
    assert.match(boundaries, /PHASE 47|phase47-windows-product-shell/);
  });

  it("existing package/smoke artifacts remain the installer payload base", () => {
    assert.ok(existsSync(path.join(repoRoot, "scripts/package.mjs")));
    assert.ok(existsSync(path.join(repoRoot, "scripts/smoke-package.mjs")));
    assert.ok(existsSync(path.join(repoRoot, "scripts/field-test-preflight.mjs")));
    assert.ok(existsSync(path.join(repoRoot, "docs/field-test-checklist.md")));
  });
});
