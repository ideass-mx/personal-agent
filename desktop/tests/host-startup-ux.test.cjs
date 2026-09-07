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
const hostSplashPath = path.join(desktopRoot, "renderer", "host-splash.html");

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
  assert.match(showSlice, /openPersonalAgentInBrowser|showHostSplashMessage/);
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

test("host mode opens external browser instead of embedding web app", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /requestBrowserLaunchUrl/);
  assert.match(src, /shell\.openExternal/);
  assert.match(src, /browserOpenedForCurrentStartup/);
  assert.match(src, /ensureAutomaticBrowserLaunch/);
  assert.match(src, /classifyBrowserOpenError/);
  assert.match(src, /showHostSplashMessage/);
  const bootIdx = src.indexOf("async function bootHostMode");
  // Include PHASE 57.10 host device enrollment before browser/tray boot steps.
  const bootSlice = src.slice(bootIdx, bootIdx + 4000);
  assert.doesNotMatch(bootSlice, /loadURL\(url\)/);
  assert.match(bootSlice, /ensureAutomaticBrowserLaunch/);
  assert.doesNotMatch(bootSlice, /createWindow\(\{\s*hostUi:\s*true/);
  assert.doesNotMatch(bootSlice, /host-splash\.html/);
});

test("host splash contains browser-unavailable and details UX", () => {
  const html = fs.readFileSync(hostSplashPath, "utf8");
  assert.match(html, /Ver detalles/);
  assert.match(html, /window\.setHostSplashState/);
  assert.match(html, /details-panel/);
  assert.doesNotMatch(html, /HUB_TOKEN|bootstrap secret|API key/i);
});

test("host uninstall shutdown destroys tray and stops supervisor cleanly", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /SHUTDOWN_HOST_ARG/);
  assert.match(src, /requestSingleInstanceLock/);
  assert.match(src, /second-instance/);
  assert.match(src, /shutdownHost\("uninstall"\)/);
  assert.match(src, /tray\.destroy\(\)/);
  assert.match(src, /await supervisor\.stop\(\)/);
  assert.match(src, /app\.quit\(\)/);
});

test("host happy path delays tray until boot completes", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  const readyIdx = src.indexOf("app.whenReady");
  const readySlice = src.slice(readyIdx, readyIdx + 900);
  assert.doesNotMatch(readySlice, /createTray\(\)\s*;\s*\n\s*const legacyOnboarding/);
  const bootIdx = src.indexOf("async function bootHostMode");
  // Include PHASE 57.10 host device enrollment before tray creation.
  const bootSlice = src.slice(bootIdx, bootIdx + 4000);
  assert.match(bootSlice, /ensureTray\(\)/);
});

test("automatic browser launch is idempotent and second-instance does not auto-open", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /browserLaunchState\s*=\s*"IDLE"/);
  assert.match(src, /browserLaunchState\s*=\s*"OPENING"/);
  assert.match(src, /browserLaunchState\s*=\s*"OPENED"/);
  assert.match(src, /browserLaunchState\s*=\s*"FAILED"/);
  assert.match(src, /ensureAutomaticBrowserLaunch\("bootHostMode",\s*reason\)/);
  const secondIdx = src.indexOf('app.on("second-instance"');
  const secondSlice = src.slice(secondIdx, secondIdx + 700);
  assert.match(secondSlice, /browser_open_skipped/);
  assert.doesNotMatch(secondSlice, /openPersonalAgentInBrowser\(/);
});

test("explicit user opens still allowed and retry remains separate", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /reason:\s*"user_requested_browser_launch"/);
  assert.match(src, /return await bootHostMode\("user_retry"\)/);
  assert.match(src, /source:\s*"ipc\.open-console"/);
});

function pathToFileUrl(p) {
  const { pathToFileURL } = require("node:url");
  return pathToFileURL(p).href;
}
