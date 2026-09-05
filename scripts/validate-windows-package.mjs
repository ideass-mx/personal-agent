/**
 * Validación automática del layout Windows (PHASE 51 + 64.1) — NO es field test.
 * Comprueba artefactos de package-windows sin compilar Inno ni instalar en Windows.
 * PHASE 64.1: native *.node must be PE (fail-closed).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageWindows } from "./package-windows.mjs";
import { validateWindowsNativeModules } from "./windows-native-modules.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  process.stderr.write(`[validate-windows-package] FAIL: ${msg}\n`);
  process.exit(1);
}

const result = await packageWindows();
const root = result.outRoot;

const required = [
  "gateway/gateway.cjs",
  "gateway/hub.cjs",
  "node/node.cjs",
  "agent/agent.cjs",
  "console/index.html",
  "web/dist/index.html",
  "desktop/main.js",
  "desktop/renderer/index.html",
  "AgentePersonal.bat",
  "AgentePersonal.vbs",
  "manifest.json",
  "README.txt",
  "VERSION",
  "build-info.json",
  "resources/personal-agent.iss",
  "resources/version.generated.iss",
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
if (!/\bstart\s+""\s+"%ELECTRON_EXE%"/.test(bat) && !bat.includes('start ""')) {
  fail("bat must start Electron detached (so CMD close does not kill the app)");
}
if (!existsSync(path.join(root, "AgentePersonal.vbs"))) {
  fail("missing AgentePersonal.vbs silent launcher");
}

const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.noNpmOnTarget !== true) fail("manifest.noNpmOnTarget");
if (!manifest.agentConsole) fail("manifest.agentConsole");
if (!existsSync(path.join(root, "build-info.json"))) fail("missing build-info.json");
const buildInfo = JSON.parse(
  readFileSync(path.join(root, "build-info.json"), "utf8"),
);
if (!buildInfo.version || !buildInfo.build || !buildInfo.commit) {
  fail("build-info incomplete");
}
if (!String(manifest.installerOutput || "").match(
  /^PersonalAgent-Setup-.+-win-x64\.exe$/,
)) {
  fail(`installerOutput name: ${manifest.installerOutput}`);
}
if (manifest.version !== buildInfo.version) {
  fail("manifest.version must match build-info.version");
}

const iss = readFileSync(
  path.join(repoRoot, "installer", "windows", "personal-agent.iss"),
  "utf8",
);
if (!iss.includes("PersonalAgent-Setup")) fail("Inno OutputBaseFilename pattern");
if (!iss.includes("MyOutputBaseFilename")) fail("Inno must use MyOutputBaseFilename");
if (!iss.includes("A8E5C2F1-9B47-4D3A-9E21-PERSONALAGENT51")) {
  fail("Inno AppId must stay stable");
}
if (!iss.includes("version.generated.iss")) {
  fail("Inno must include version.generated.iss");
}
if (!iss.includes("runtime\\electron\\electron.exe")) {
  fail("Inno shortcuts must target electron.exe (no CMD launcher)");
}
if (/MyAppExeName "AgentePersonal\.bat"/.test(iss)) {
  fail("Inno must not use AgentePersonal.bat as primary shortcut");
}
if (!iss.includes("MyAppParams")) {
  fail("Inno must pass desktop path Parameters to Electron");
}
if (!iss.includes("#if !FileExists(SourceRoot")) {
  fail("Inno must ISPP-check SourceRoot runtimes at compile time");
}
if (!iss.includes("#error")) fail("Inno must #error when runtimes missing at compile");
if (iss.includes("InitializeSetup")) {
  fail("Inno must not FileExists(SourceRoot) in InitializeSetup (breaks end-user install)");
}
if (/npm install/i.test(iss)) fail("Inno must not run npm install");

process.stdout.write("[validate-windows-package] layout OK\n");

const nodeExe = path.join(root, "runtime", "node", "node.exe");
const electronExe = path.join(root, "runtime", "electron", "electron.exe");
const hasNode = existsSync(nodeExe);
const hasElectron = existsSync(electronExe);

process.stdout.write(
  `[validate-windows-package] runtimeReady=${result.runtimeReady} (node.exe+electron.exe)\n`,
);
process.stdout.write(
  `[validate-windows-package] node.exe=${hasNode} electron.exe=${hasElectron}\n`,
);
process.stdout.write(
  "[validate-windows-package] AUTOMATED / MOCK VALIDATION — not Windows field\n",
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
    `REQUIRED Windows runtimes missing (node.exe=${hasNode} electron.exe=${hasElectron}). Set FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1`,
  );
}

// Defense in depth: packageWindows already asserted; re-scan for clear CI log.
const natives = validateWindowsNativeModules(root);
if (!natives.ok) {
  fail(`native modules incompatible: ${natives.errors.join("; ")}`);
}
process.stdout.write(
  `[validate-windows-package] nativeModules=${natives.modules.length} PE validation PASS\n`,
);

process.stdout.write("[validate-windows-package] PASS\n");
