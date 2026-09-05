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

describe("PHASE 51 Windows installer + Agent Console integration", () => {
  it("docs exist; field validation not simulated", () => {
    const doc = read(
      "docs/architecture/phase51-windows-installer-and-console-integration.md",
    );
    assert.match(doc, /PHASE 51/);
    assert.match(doc, /READY WITH DEBT|BLOCKED/);
    assert.match(doc, /NOT EXECUTED|NOT TESTED|BLOCKED/);
    assert.match(doc, /no npm|NO npm|sin npm/i);
    assert.ok(
      existsSync(
        path.join(
          repoRoot,
          "docs/architecture/phase51-windows-installation-validation.md",
        ),
      ),
    );
  });

  it("package-windows embeds Console and forbids npm first-run", () => {
    const pkg = read("scripts/package-windows.mjs");
    assert.match(pkg, /console/);
    assert.match(pkg, /FETCH_ELECTRON_WIN/);
    assert.match(pkg, /buildWebConsole|web\/dist/);
    assert.match(pkg, /No uses npm|NO npm|noNpmOnTarget/i);
    const batSnippet = pkg;
    assert.match(batSnippet, /electron\.exe/);
    assert.doesNotMatch(pkg, /Ejecuta npm install en desktop/);
    // Electron GitHub assets are win32-x64 (not win-x64); tag must exist.
    assert.match(pkg, /electron-\$\{version\}-win32-x64\.zip/);
    assert.doesNotMatch(pkg, /electron-\$\{version\}-win-x64\.zip/);
  });

  it("Inno produces PersonalAgent-Setup and checks runtimes at compile time", () => {
    const iss = read("installer/windows/personal-agent.iss");
    assert.match(iss, /PersonalAgent-Setup/);
    assert.match(iss, /MyOutputBaseFilename|version\.generated\.iss/);
    assert.match(iss, /MyAppShutdownParams/);
    assert.match(
      iss,
      /AppId=\{\{A8E5C2F1-9B47-4D3A-9E21-PERSONALAGENT51\}\}/,
    );
    // Compile-time ISPP #error — NOT InitializeSetup FileExists on SourceRoot
    // (that path only exists on the build machine; it broke end-user installs).
    assert.match(iss, /#if !FileExists\(SourceRoot/);
    assert.match(iss, /#error/);
    assert.doesNotMatch(iss, /InitializeSetup/);
    assert.match(iss, /CurStepChanged/);
    assert.match(iss, /\{app\}\\runtime\\node\\node\.exe/);
    assert.match(iss, /node\.exe/);
    assert.match(iss, /electron\.exe/);
    assert.match(iss, /console\\index\.html|console\\\\index\.html|console/);
    assert.doesNotMatch(iss, /npm install/i);
    assert.match(iss, /RequestHostShutdownForUninstall/);
    assert.match(iss, /--shutdown-host/);
    assert.match(iss, /\[UninstallDelete\]/);
    assert.match(iss, /\{userstartup\}\\\{#MyAppName\}\.lnk/);
    assert.match(iss, /\{autodesktop\}\\\{#MyAppName\}\.lnk/);
    assert.match(iss, /\{group\}\\Desinstalar \{#MyAppName\}\.lnk/);
    assert.doesNotMatch(iss, /CurrentVersion\\Run/);
  });

  it("tray shell opens Console; no Chat; workspace env wired", () => {
    const main = read("desktop/main.js");
    assert.match(main, /open-console|openConsole|openExternal/);
    assert.match(main, /AGENT_FILESYSTEM_ROOT/);
    assert.match(main, /AGENT_CONSOLE_STATIC/);
    assert.match(main, /NETWORK_NOT_READY|verify-secure-network|Tailscale/);
    assert.doesNotMatch(main, /user_message|ChatScreen|createAgentRuntime/);
    const html = read("desktop/renderer/index.html");
    assert.match(html, /AGENT READY|Open Agent Console/);
    assert.match(html, /Bienvenido|Welcome/i);
    assert.match(html, /Secure Network|Tailscale/);
  });

  it("PHASE 51B onboarding modules exist", () => {
    assert.ok(
      existsSync(
        path.join(repoRoot, "desktop/lib/onboarding.cjs"),
      ),
    );
    assert.ok(
      existsSync(
        path.join(repoRoot, "desktop/lib/tailscale.cjs"),
      ),
    );
    assert.ok(
      existsSync(
        path.join(
          repoRoot,
          "docs/architecture/phase51b-onboarding-secure-network.md",
        ),
      ),
    );
    const ob = read("desktop/lib/onboarding.cjs");
    assert.match(ob, /NETWORK_READY/);
    assert.match(ob, /AGENT_PROVISIONING/);
    assert.doesNotMatch(ob, /AGENT_INSTALLING:\s*"AGENT_INSTALLING"/);
    assert.match(ob, /onboarding\.json/);
    assert.ok(existsSync(path.join(repoRoot, "desktop/lib/pairing.cjs")));
  });

  it("Console static resolve includes packaged console/", () => {
    const src = read("gateway/src/http/console-static.ts");
    assert.match(src, /\.\.\/console|console/);
  });

  it("boundaries mention PHASE 51; carried debt referenced", () => {
    const boundaries = read("docs/architecture/boundaries.md");
    assert.match(boundaries, /PHASE 51|phase51/);
    const doc = read(
      "docs/architecture/phase51-windows-installer-and-console-integration.md",
    );
    assert.match(doc, /D-50-0/);
  });

  it("no protocol change claimed", () => {
    const proto = read("packages/protocol/PROTOCOL.md");
    assert.doesNotMatch(proto, /PHASE 51/);
  });

  it("Windows installer CI workflow exists (artifact-only, no Release)", () => {
    const wf = path.join(
      repoRoot,
      ".github/workflows/windows-installer.yml",
    );
    assert.ok(existsSync(wf), "windows-installer.yml");
    const yml = read(".github/workflows/windows-installer.yml");
    assert.match(yml, /windows-latest/);
    assert.match(yml, /workflow_dispatch/);
    assert.match(yml, /FETCH_NODE_WIN/);
    assert.match(yml, /FETCH_ELECTRON_WIN/);
    assert.match(yml, /PersonalAgent-Setup-\*-win-x64\.exe|finalize-installer/);
    assert.match(yml, /artifact_name=/);
    assert.doesNotMatch(yml, /dist\/releases/);
    assert.doesNotMatch(yml, /name:\s*PersonalAgent-Windows-Installer\s*$/m);
    assert.match(yml, /ELECTRON_WIN_VERSION:\s*"v33\.4\.11"/);
    assert.match(yml, /win32-x64/);
    assert.doesNotMatch(yml, /ELECTRON_WIN_VERSION:\s*"v33\.2\.1"/);
    assert.doesNotMatch(yml, /softprops\/action-gh-release|upload.*release/i);
    assert.ok(
      existsSync(
        path.join(repoRoot, "docs/architecture/windows-installer-ci.md"),
      ),
    );
  });
});
