"use strict";

/**
 * Host mode regressions (Fase 3 + 6/7): sin Tailscale obligatorio, sin LLM en boot.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.join(__dirname, "..");
const mainPath = path.join(desktopRoot, "main.js");
const hostBootPath = path.join(desktopRoot, "lib", "host-boot.cjs");
const splashPath = path.join(desktopRoot, "renderer", "host-splash.html");

test("host-splash exists for host boot UX", () => {
  assert.equal(fs.existsSync(splashPath), true);
  const html = fs.readFileSync(splashPath, "utf8");
  assert.match(html, /agente/i);
});

test("host-boot waits for Gateway health and requests browser bootstrap", () => {
  const src = fs.readFileSync(hostBootPath, "utf8");
  assert.match(src, /\/health/);
  assert.match(src, /\/v1\/host\/browser-sessions/);
  assert.match(src, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(src, /pa_console_session_v1|pa_host_bootstrap/);
  assert.doesNotMatch(src, /probeTailscale|verifySecureNetwork|ANTHROPIC/);
});

test("main.js default host mode without Tailscale / LLM gate", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /bootHostMode/);
  assert.match(src, /PERSONAL_AGENT_LEGACY_ONBOARDING/);
  assert.match(src, /waitForHealth/);
  assert.match(src, /host-splash\.html/);
  // Host path must not require Tailscale before opening console
  const bootIdx = src.indexOf("async function bootHostMode");
  assert.ok(bootIdx > 0);
  const bootSlice = src.slice(bootIdx, bootIdx + 2500);
  assert.doesNotMatch(bootSlice, /probeTailscale|verifySecureNetwork|runPreflight/);
  assert.doesNotMatch(bootSlice, /ANTHROPIC_API_KEY/);
});

test("legacy onboarding flag still wired", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(
    src,
    /PERSONAL_AGENT_LEGACY_ONBOARDING\s*===\s*["']1["']/,
  );
});

test("Gateway crash / supervisor handling remains present", () => {
  const src = fs.readFileSync(mainPath, "utf8");
  assert.match(src, /supervisor\.(start|stop)/);
  assert.match(src, /gateway_start_failed|health_timeout|start_failed/);
});
