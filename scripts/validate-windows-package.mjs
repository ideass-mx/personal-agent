/**
 * Validación automática del layout Windows (PHASE 51) — NO es field test.
 * Comprueba artefactos de package-windows sin compilar Inno ni instalar en Windows.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageWindows } from "./package-windows.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  process.stderr.write(`[validate-windows-package] FAIL: ${msg}\n`);
  process.exit(1);
}

const result = await packageWindows();
const root = result.outRoot;

const required = [
  "gateway/hub.cjs",
  "agent/agent.cjs",
  "console/index.html",
  "web/dist/index.html",
  "desktop/main.js",
  "desktop/renderer/index.html",
  "AgentePersonal.bat",
  "manifest.json",
  "README.txt",
  "VERSION",
  "resources/personal-agent.iss",
  "config/product.example.json",
];

for (const rel of required) {
  if (!existsSync(path.join(root, rel))) fail(`missing ${rel}`);
}

const bat = readFileSync(path.join(root, "AgentePersonal.bat"), "utf8");
if (/npm install/i.test(bat)) {
  fail("AgentePersonal.bat must not instruct npm install");
}
if (!bat.includes("runtime\\electron\\electron.exe")) {
  fail("bat must launch bundled Electron");
}
if (!bat.includes("runtime\\node\\node.exe")) {
  fail("bat must require bundled Node");
}

const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.noNpmOnTarget !== true) fail("manifest.noNpmOnTarget");
if (!manifest.agentConsole) fail("manifest.agentConsole");
if (manifest.installerOutput !== "PersonalAgent-Setup.exe") {
  fail("installerOutput name");
}

const iss = readFileSync(
  path.join(repoRoot, "installer/windows/personal-agent.iss"),
  "utf8",
);
if (!iss.includes("PersonalAgent-Setup")) fail("Inno OutputBaseFilename");
if (!iss.includes("InitializeSetup")) fail("Inno InitializeSetup runtime checks");
if (/npm install/i.test(iss)) fail("Inno must not run npm install");

process.stdout.write("[validate-windows-package] layout OK\n");
process.stdout.write(
  `[validate-windows-package] runtimeReady=${result.runtimeReady} (node.exe+electron.exe)\n`,
);
process.stdout.write(
  "[validate-windows-package] AUTOMATED / MOCK VALIDATION — not Windows field\n",
);

const nodeExe = path.join(root, "runtime", "node", "node.exe");
const electronExe = path.join(root, "runtime", "electron", "electron.exe");
const hasNode = existsSync(nodeExe);
const hasElectron = existsSync(electronExe);
process.stdout.write(
  `[validate-windows-package] node.exe=${hasNode} electron.exe=${hasElectron}\n`,
);

const requireRuntimes =
  process.env.REQUIRE_WINDOWS_RUNTIMES === "1" ||
  process.env.REQUIRE_WINDOWS_RUNTIMES === "true";

if (!result.runtimeReady) {
  process.stdout.write(
    "[validate-windows-package] NOTE: embed runtimes with FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1 before Inno compile\n",
  );
}

if (requireRuntimes && (!hasNode || !hasElectron || !result.runtimeReady)) {
  fail(
    "REQUIRED Windows runtimes missing (node.exe and/or electron.exe). Set FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1",
  );
}

process.stdout.write("[validate-windows-package] PASS\n");
