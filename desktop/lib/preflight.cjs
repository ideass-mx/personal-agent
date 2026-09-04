"use strict";

/**
 * Preflight before Agent Runtime is considered operable.
 * Tailscale readiness is required for NETWORK_READY.
 * PERSONAL_AGENT_SKIP_TAILSCALE is ignored outside development builds.
 */
const os = require("node:os");
const dns = require("node:dns");
const { probeTailscale, TailscalePhase } = require("./tailscale.cjs");
const {
  classifyInstallScenario,
  InstallScenario,
} = require("./install-scenario.cjs");
const { getAgentHostId, hasPersistedPairingAuth } = require("./agent-identity.cjs");
const { OnboardingState } = require("./onboarding.cjs");
const config = require("./config.cjs");
const { logOnboarding } = require("./onboarding-log.cjs");

/**
 * Map preflight result → next onboarding state.
 * Never returns PREFLIGHT (invariant: no PREFLIGHT → PREFLIGHT polling).
 *
 * @param {{
 *   scenario: { scenario: string },
 *   networkReady: boolean,
 *   checks: { tailscale: { phase: string } },
 *   ok: boolean,
 *   blocking: string[],
 * }} preflight
 * @returns {{ state: string, reason: string, errorCode?: string }}
 */
function resolvePostPreflightState(preflight) {
  const scenario = preflight?.scenario?.scenario;
  if (scenario === InstallScenario.NO_DOWNGRADE) {
    return {
      state: OnboardingState.ERROR,
      reason: "no_downgrade",
      errorCode: "NO_DOWNGRADE",
    };
  }
  const phase = preflight?.checks?.tailscale?.phase || TailscalePhase.MISSING;
  if (preflight?.networkReady === true || phase === TailscalePhase.READY) {
    return {
      state: OnboardingState.NETWORK_VERIFYING,
      reason: "tailscale_ready_verify",
    };
  }
  if (phase === TailscalePhase.MISSING) {
    return {
      state: OnboardingState.NETWORK_INSTALLING,
      reason: "tailscale_missing",
    };
  }
  if (phase === TailscalePhase.AUTH_REQUIRED) {
    return {
      state: OnboardingState.NETWORK_AUTHENTICATION,
      reason: "tailscale_auth_required",
    };
  }
  // CONNECTED or other not-ready phases → explicit verify / wait UI
  return {
    state: OnboardingState.NETWORK_VERIFYING,
    reason: "network_not_ready",
  };
}

function checkWindowsVersion() {
  if (process.platform !== "win32") {
    return {
      ok: true,
      platform: process.platform,
      note: "non_windows_host",
      version: os.release(),
    };
  }
  // Windows 10+ roughly: build >= 10240; we accept win32 generically for PHASE 51.
  return {
    ok: true,
    platform: "win32",
    arch: process.arch,
    version: os.release(),
  };
}

function checkArchitecture() {
  const arch = process.arch;
  const ok = arch === "x64" || arch === "arm64";
  return { ok, arch };
}

function checkAdministrator() {
  // Product install is PrivilegesRequired=lowest (per-user).
  // Admin is informational: Tailscale MSI often needs elevation to install,
  // but we do not require admin for Personal Agent itself.
  if (process.platform !== "win32") {
    return { ok: true, isAdmin: null, required: false };
  }
  try {
    const { execSync } = require("node:child_process");
    execSync("net session", { stdio: "ignore", windowsHide: true });
    return { ok: true, isAdmin: true, required: false };
  } catch {
    return { ok: true, isAdmin: false, required: false };
  }
}

function checkInternetConnectivity() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(
      () => done({ ok: false, error: "NO_INTERNET_TIMEOUT" }),
      4000,
    );
    dns.lookup("tailscale.com", { family: 4 }, (err) => {
      clearTimeout(timer);
      if (err) done({ ok: false, error: "NO_INTERNET" });
      else done({ ok: true });
    });
  });
}

/**
 * @param {{
 *   productRoot: string | null,
 *   onboardingState: string | null,
 *   processHealthy?: boolean | null,
 *   probeTailscaleFn?: typeof probeTailscale,
 * }} input
 */
async function runPreflight(input) {
  const windows = checkWindowsVersion();
  const architecture = checkArchitecture();
  const admin = checkAdministrator();
  const internet = await checkInternetConnectivity();
  const tailscale = (input.probeTailscaleFn || probeTailscale)();
  const cfg = config.loadConfig();
  const scenario = classifyInstallScenario({
    productRoot: input.productRoot,
    onboardingState: input.onboardingState,
    processHealthy: input.processHealthy,
  });

  const checks = {
    windows,
    architecture,
    administrator: admin,
    internet,
    tailscale: {
      installed: tailscale.installed,
      authenticated: tailscale.authenticated,
      connected: tailscale.connected,
      ready: tailscale.ready,
      phase: tailscale.phase,
      error: tailscale.error,
      skipped: Boolean(tailscale.skipped),
      // identity fields are Tailscale device — not Agent identity
      selfDnsName: tailscale.selfDnsName,
      ipv4: tailscale.ipv4,
      tailnet: tailscale.tailnet,
    },
    existingAgent: {
      firstRunComplete: Boolean(cfg.firstRunComplete),
      workspaceRoot: Boolean(cfg.workspaceRoot),
      agentHostId: Boolean(getAgentHostId()),
      pairingAuth: hasPersistedPairingAuth(),
    },
    scenario,
  };

  const blocking = [];
  if (!architecture.ok) blocking.push("UNSUPPORTED_ARCH");
  if (!internet.ok && !tailscale.ready) blocking.push("NO_INTERNET");
  if (scenario.scenario === InstallScenario.NO_DOWNGRADE) {
    blocking.push("NO_DOWNGRADE");
  }

  const networkReady = Boolean(tailscale.ready);
  const ok = blocking.length === 0;

  logOnboarding("PREFLIGHT", ok ? "ok" : "blocked", {
    scenario: scenario.scenario,
    blocking,
    networkReady,
    tailscalePhase: tailscale.phase,
    hasIdentity: checks.existingAgent.agentHostId,
    hasPairing: checks.existingAgent.pairingAuth,
  });

  return {
    ok,
    blocking,
    networkReady,
    checks,
    scenario,
  };
}

module.exports = {
  runPreflight,
  resolvePostPreflightState,
  checkWindowsVersion,
  checkArchitecture,
  checkAdministrator,
};
