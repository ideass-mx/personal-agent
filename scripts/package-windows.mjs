/**
 * Ensambla dist/windows/PersonalAgent/ para instalador Windows (PHASE 51).
 * Incluye Agent Console estático + layout sin npm en first-run.
 * En Linux valida layout + fuentes Inno; Setup.exe se compila en Windows.
 *
 * Opcional:
 *   FETCH_NODE_WIN=1     descarga Node 22 win-x64
 *   FETCH_ELECTRON_WIN=1 descarga Electron win32-x64
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pack } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "dist", "windows", "PersonalAgent");

function tryUnzip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const unzip = spawnSync("unzip", ["-o", zipPath, "-d", destDir], {
    encoding: "utf8",
  });
  if (unzip.status === 0) return true;
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ],
    { encoding: "utf8" },
  );
  return ps.status === 0;
}

function flattenOnceIfSingleChild(dir) {
  const kids = readdirSync(dir, { withFileTypes: true }).filter(
    (d) => d.name !== "." && d.name !== "..",
  );
  if (kids.length === 1 && kids[0].isDirectory()) {
    const nested = path.join(dir, kids[0].name);
    for (const name of readdirSync(nested)) {
      const from = path.join(nested, name);
      const to = path.join(dir, name);
      if (existsSync(to)) rmSync(to, { recursive: true, force: true });
      renameSync(from, to);
    }
    rmSync(nested, { recursive: true, force: true });
  }
}

async function fetchNodeWin(destDir) {
  const version = process.env.NODE_WIN_VERSION || "v22.14.0";
  const url = `https://nodejs.org/dist/${version}/node-${version}-win-x64.zip`;
  mkdirSync(destDir, { recursive: true });
  writeFileSync(
    path.join(destDir, "FETCH.txt"),
    [
      "Embedded Node for Windows (PHASE 51).",
      `Download: ${url}`,
      "Required layout: runtime/node/node.exe",
      "Set FETCH_NODE_WIN=1 when packaging with network.",
      "Inno Setup MUST NOT be compiled without node.exe for end-user installs.",
      "",
    ].join("\n"),
    "utf8",
  );

  if (process.env.FETCH_NODE_WIN !== "1") {
    return { fetched: false, extracted: false, url, hasNodeExe: existsSync(path.join(destDir, "node.exe")) };
  }

  const zipPath = path.join(destDir, "node-win.zip");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Node download failed: ${res.status}`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const extracted = tryUnzip(zipPath, destDir);
  if (extracted) flattenOnceIfSingleChild(destDir);
  const hasNodeExe = existsSync(path.join(destDir, "node.exe"));
  writeFileSync(
    path.join(destDir, "NODE_ZIP.txt"),
    `zip=${path.basename(zipPath)}\nversion=${version}\nextracted=${extracted}\nhasNodeExe=${hasNodeExe}\n`,
    "utf8",
  );
  return { fetched: true, extracted, url, hasNodeExe, zipPath };
}

async function fetchElectronWin(destDir) {
  // Electron release assets use win32-x64 (not win-x64). Tag must exist on GitHub.
  const version = process.env.ELECTRON_WIN_VERSION || "v33.4.11";
  const url = `https://github.com/electron/electron/releases/download/${version}/electron-${version}-win32-x64.zip`;
  mkdirSync(destDir, { recursive: true });
  writeFileSync(
    path.join(destDir, "FETCH.txt"),
    [
      "Embedded Electron for Windows tray shell (PHASE 51).",
      `Download: ${url}`,
      "Required layout: runtime/electron/electron.exe",
      "Set FETCH_ELECTRON_WIN=1 when packaging with network.",
      "NO npm install on the end-user machine.",
      "",
    ].join("\n"),
    "utf8",
  );

  if (process.env.FETCH_ELECTRON_WIN !== "1") {
    return {
      fetched: false,
      extracted: false,
      url,
      hasElectronExe: existsSync(path.join(destDir, "electron.exe")),
    };
  }

  const zipPath = path.join(destDir, "electron-win.zip");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Electron download failed: ${res.status} (${url}). Set ELECTRON_WIN_VERSION to a published tag.`,
    );
  }
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const extracted = tryUnzip(zipPath, destDir);
  const hasElectronExe = existsSync(path.join(destDir, "electron.exe"));
  writeFileSync(
    path.join(destDir, "ELECTRON_ZIP.txt"),
    `zip=${path.basename(zipPath)}\nversion=${version}\nextracted=${extracted}\nhasElectronExe=${hasElectronExe}\n`,
    "utf8",
  );
  return { fetched: true, extracted, url, hasElectronExe, zipPath };
}

function buildWebConsole() {
  const webDir = path.join(repoRoot, "web");
  if (!existsSync(path.join(webDir, "package.json"))) {
    throw new Error("web/ missing — Agent Console required for PHASE 51");
  }
  if (!existsSync(path.join(webDir, "node_modules"))) {
    const inst = spawnSync("npm", ["install"], {
      cwd: webDir,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (inst.status !== 0) {
      throw new Error(`npm install web failed: ${inst.stderr || inst.stdout}`);
    }
  }
  const build = spawnSync("npm", ["run", "build"], {
    cwd: webDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) {
    throw new Error(`web build failed: ${build.stderr || build.stdout}`);
  }
  const dist = path.join(webDir, "dist");
  if (!existsSync(path.join(dist, "index.html"))) {
    throw new Error("web/dist/index.html missing after build");
  }
  return dist;
}

export async function packageWindows() {
  await pack();
  const webDist = buildWebConsole();

  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });

  const gateway = path.join(outRoot, "gateway");
  const agent = path.join(outRoot, "agent");
  const desktop = path.join(outRoot, "desktop");
  const runtimeNode = path.join(outRoot, "runtime", "node");
  const runtimeElectron = path.join(outRoot, "runtime", "electron");
  const consoleDir = path.join(outRoot, "console");
  const webDistOut = path.join(outRoot, "web", "dist");
  const resources = path.join(outRoot, "resources");

  mkdirSync(gateway, { recursive: true });
  mkdirSync(agent, { recursive: true });
  mkdirSync(desktop, { recursive: true });
  mkdirSync(resources, { recursive: true });

  cpSync(path.join(repoRoot, "dist", "hub"), gateway, { recursive: true });
  cpSync(path.join(repoRoot, "dist", "agent"), agent, { recursive: true });
  if (existsSync(path.join(repoRoot, "dist", "migrations"))) {
    cpSync(
      path.join(repoRoot, "dist", "migrations"),
      path.join(outRoot, "migrations"),
      { recursive: true },
    );
    cpSync(
      path.join(repoRoot, "dist", "migrations"),
      path.join(gateway, "migrations"),
      { recursive: true },
    );
  }

  // Agent Console static (same-origin via Gateway)
  cpSync(webDist, consoleDir, { recursive: true });
  mkdirSync(path.dirname(webDistOut), { recursive: true });
  cpSync(webDist, webDistOut, { recursive: true });
  mkdirSync(path.join(repoRoot, "dist", "web"), { recursive: true });
  cpSync(webDist, path.join(repoRoot, "dist", "web"), { recursive: true });

  // Desktop shell sources only (no npm on target)
  for (const name of [
    "main.js",
    "preload.js",
    "package.json",
    "lib",
    "renderer",
  ]) {
    const src = path.join(repoRoot, "desktop", name);
    if (existsSync(src)) {
      cpSync(src, path.join(desktop, name), { recursive: true });
    }
  }

  const nodeInfo = await fetchNodeWin(runtimeNode);
  const electronInfo = await fetchElectronWin(runtimeElectron);

  writeFileSync(
    path.join(outRoot, "AgentePersonal.bat"),
    [
      "@echo off",
      "setlocal",
      "set \"ROOT=%~dp0\"",
      "set \"PERSONAL_AGENT_PRODUCT_ROOT=%ROOT%\"",
      "set \"NODE_EXE=%ROOT%runtime\\node\\node.exe\"",
      "set \"ELECTRON_EXE=%ROOT%runtime\\electron\\electron.exe\"",
      "if not exist \"%ELECTRON_EXE%\" (",
      "  echo [Personal Agent] Falta Electron embebido ^(runtime\\electron\\electron.exe^).",
      "  echo Reinstala con el instalador oficial. No uses npm en esta PC.",
      "  exit /b 1",
      ")",
      "if not exist \"%NODE_EXE%\" (",
      "  echo [Personal Agent] Falta Node embebido ^(runtime\\node\\node.exe^).",
      "  echo Reinstala con el instalador oficial. No uses npm en esta PC.",
      "  exit /b 1",
      ")",
      "\"%ELECTRON_EXE%\" \"%ROOT%desktop\"",
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n"),
    "utf8",
  );

  mkdirSync(path.join(outRoot, "config"), { recursive: true });
  writeFileSync(
    path.join(outRoot, "config", "product.example.json"),
    JSON.stringify(
      {
        version: 1,
        workspaceRoot: null,
        hubPort: 8787,
        firstRunComplete: false,
        note: "Real config lives in %LOCALAPPDATA%\\Ideass\\PersonalAgent\\config\\ — never ship secrets here.",
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(path.join(outRoot, "VERSION"), "0.1.0-phase51\n", "utf8");

  const runtimeReady =
    Boolean(nodeInfo.hasNodeExe) && Boolean(electronInfo.hasElectronExe);

  const manifest = {
    product: "PersonalAgent",
    version: "0.1.0",
    phase: 51,
    layout: [
      "runtime/node",
      "runtime/electron",
      "gateway",
      "agent",
      "console",
      "web/dist",
      "desktop",
      "resources",
      "migrations",
    ],
    agentConsole: {
      path: "console/",
      urlWhenHostRunning: "http://localhost:8787/",
      sameOrigin: true,
    },
    embeddedNode: nodeInfo,
    embeddedElectron: electronInfo,
    runtimeReadyForEndUser: runtimeReady,
    noNpmOnTarget: true,
    configLocation: "%LOCALAPPDATA%\\Ideass\\PersonalAgent\\",
    secretsPolicy: "never in install dir; AppData secrets.json",
    uninstall: {
      removeBinaries: true,
      preserveWorkspace: true,
      askBeforeDeletingConfigAndDb: true,
    },
    installerOutput: "PersonalAgent-Setup.exe",
    windowsFieldValidation: "NOT_EXECUTED_ON_LINUX_PACKAGER",
    installerCompilation: "REQUIRES_WINDOWS_INNO_SETUP",
  };
  writeFileSync(
    path.join(outRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  writeFileSync(
    path.join(outRoot, "README.txt"),
    [
      "Personal Agent — Windows product layout (PHASE 51)",
      "",
      "gateway/           Hub (Gateway + Agent Runtime)",
      "agent/             Local Node (MCP + Tools)",
      "console/           Agent Console (static Web UI)",
      "desktop/           Tray / first-run shell (no Chat)",
      "runtime/node/      Portable Node (node.exe required)",
      "runtime/electron/  Portable Electron (electron.exe required)",
      "",
      "NO Node.js / npm required on the user PC.",
      "NO repository checkout. NO terminal for first-run.",
      "",
      "When Host is READY: http://localhost:8787/ = Agent Console",
      "Config/logs/DB: %LOCALAPPDATA%\\Ideass\\PersonalAgent\\",
      "Workspace: first-run folder (AGENT_FILESYSTEM_ROOT) — never deleted by uninstall.",
      "",
      "Compile installer on Windows with Inno Setup 6+:",
      "  installer\\windows\\personal-agent.iss",
      "  Output: dist\\windows\\PersonalAgent-Setup.exe",
      "",
      `Embedded runtimes ready: ${runtimeReady ? "YES" : "NO — fetch or place node.exe + electron.exe before compiling Setup"}`,
      "",
      "WINDOWS FIELD VALIDATION = NOT EXECUTED from this Linux pack step.",
      "INNO COMPILATION = REQUIRES WINDOWS.",
      "",
    ].join("\n"),
    "utf8",
  );

  const iss = path.join(repoRoot, "installer", "windows", "personal-agent.iss");
  if (existsSync(iss)) {
    cpSync(iss, path.join(resources, "personal-agent.iss"));
  }

  if (!runtimeReady) {
    process.stderr.write(
      "[package-windows] WARN: node.exe and/or electron.exe missing — end-user Setup must not ship without them. Set FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1\n",
    );
  }

  return { outRoot, manifest, runtimeReady };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await packageWindows();
  process.stderr.write(`[package-windows] OK ${result.outRoot}\n`);
  process.stderr.write(
    `[package-windows] runtimeReady=${result.runtimeReady}\n`,
  );
}
