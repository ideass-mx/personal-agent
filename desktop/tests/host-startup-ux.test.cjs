"use strict";

/**
 * Fase 7.6 — host startup UX: no CMD primary launcher, no legacy onboarding default.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.join(__dirname, "..");
const repoRoot = path.join(desktopRoot, "..");
const mainPath = path.join(desktopRoot, "main.js");
const agentProcessPath = path.join(desktopRoot, "lib", "agent-process.cjs");
const issPath = path.join(repoRoot, "installer", "windows", "personal-agent.iss");
const launcherPath = path.join(
  repoRoot,
  "scripts",
  "release",
  "windows-launcher.mjs",
);

test("default startup is host mode (Web onboarding), not legacy Electron UI", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /bootHostMode/);
  assert.match(src, /hostModeActive\s*=\s*true/);
  assert.match(src, /PERSONAL_AGENT_LEGACY_ONBOARDING/);
  const readyIdx = src.indexOf("app.whenReady");
  const slice = src.slice(readyIdx, readyIdx + 900);
  assert.match(
    slice,
    /if\s*\(\s*!legacyOnboarding\s*\)\s*\{\s*await bootHostMode\(\);\s*return;/,
  );
});

test("showProductWindow never loads legacy index in host mode", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /async function showProductWindow/);
  assert.match(src, /hostModeActive/);
  const showIdx = src.indexOf("async function showProductWindow");
  const showSlice = src.slice(showIdx, showIdx + 800);
  assert.doesNotMatch(showSlice, /renderer[\\/]+index\.html/);
  assert.match(showSlice, /consoleHttpUrl|loadURL/);
});

test("Gateway spawn hides Windows console", () => {
  const src = fs.readFileSync(agentProcessPath, "utf8");
  assert.match(src, /windowsHide:\s*true/);
  assert.match(src, /shell:\s*false/);
  assert.match(src, /stdio:\s*\[\s*["']ignore["']/);
});

test("Inno primary shortcut targets electron.exe with desktop params", () => {
  const iss = fs.readFileSync(issPath, "utf8");
  assert.match(iss, /MyAppExeName "runtime\\electron\\electron\.exe"/);
  assert.match(iss, /MyAppParams/);
  assert.match(iss, /Parameters: \{#MyAppParams\}/);
  assert.doesNotMatch(iss, /MyAppExeName "AgentePersonal\.bat"/);
});

test("bat launcher detaches Electron; vbs has no cmd echo", async () => {
  const { buildAgentePersonalBat, buildAgentePersonalVbs } = await import(
    pathToFileUrl(launcherPath)
  );
  const bat = buildAgentePersonalBat();
  assert.match(bat, /start "" "%ELECTRON_EXE%"/);
  assert.doesNotMatch(bat, /"%ELECTRON_EXE%" "%ROOT%desktop"\r?\nexit \/b %ERRORLEVEL%/);
  const vbs = buildAgentePersonalVbs();
  assert.match(vbs, /WScript\.Shell/);
  assert.match(vbs, /electron\.exe/);
  assert.match(vbs, /silent launcher/i);
  // Executable lines must not invoke cmd.exe
  const codeLines = vbs
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("'"))
    .join("\n");
  assert.doesNotMatch(codeLines, /cmd\.exe/i);
});

function pathToFileUrl(p) {
  const { pathToFileURL } = require("node:url");
  return pathToFileURL(p).href;
}
