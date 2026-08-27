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

describe("PHASE 48 Windows installer & product shell", () => {
  it("docs READY WITH DEBT; Windows field NOT EXECUTED; 48A wired", () => {
    const doc = read(
      "docs/architecture/phase48-windows-installer-and-product-shell-implementation.md",
    );
    assert.match(doc, /PHASE 48 CLOSED/);
    assert.match(doc, /READY WITH DEBT/);
    assert.match(doc, /WINDOWS FIELD VALIDATION = NOT EXECUTED/);
    assert.match(doc, /48A/);
    assert.match(doc, /resolveAgentFilesystemRoot|filesystemRoot/);
  });

  it("48A boot path loads dotenv and passes filesystemRoot", () => {
    const index = read("hub/src/index.ts");
    assert.match(index, /dotenv\/config/);
    assert.match(index, /filesystemRoot/);
    assert.ok(
      existsSync(
        path.join(repoRoot, "hub/src/runtime/resolve-filesystem-root.ts"),
      ),
    );
  });

  it("installer + package-windows + desktop shell exist", () => {
    assert.ok(
      existsSync(
        path.join(repoRoot, "installer/windows/personal-agent.iss"),
      ),
    );
    assert.ok(
      existsSync(path.join(repoRoot, "scripts/package-windows.mjs")),
    );
    assert.ok(existsSync(path.join(repoRoot, "desktop/main.js")));
    assert.ok(existsSync(path.join(repoRoot, "desktop/lib/config.cjs")));
    assert.ok(
      existsSync(path.join(repoRoot, "desktop/lib/diagnostics.cjs")),
    );
  });

  it("Shell is not a Runtime / no Chat / no ACL", () => {
    const main = read("desktop/main.js");
    assert.doesNotMatch(main, /createAgentRuntime|ToolRegistry|ConfirmationWaiter/);
    assert.match(main, /tray|Tray/i);
    const doc = read(
      "docs/architecture/phase48-windows-installer-and-product-shell-implementation.md",
    );
    assert.match(doc, /No Chat/);
    assert.doesNotMatch(doc, /User\/ACL implemented|PermissionManager implemented/i);
  });

  it("Inno uninstall never deletes workspace silently", () => {
    const iss = read("installer/windows/personal-agent.iss");
    assert.match(iss, /NUNCA|never|Workspace/i);
    assert.match(iss, /InitializeUninstall/);
    assert.match(iss, /PrivilegesRequired=lowest/);
  });

  it("boundaries mention PHASE 48", () => {
    assert.match(read("docs/architecture/boundaries.md"), /PHASE 48|phase48/);
  });
});
