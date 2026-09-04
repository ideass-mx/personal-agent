"use strict";

/**
 * Install scenario classification for idempotent onboarding.
 * Does NOT install an Agent — only classifies existing state.
 */
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config.cjs");
const { getAgentHostId, hasPersistedPairingAuth } = require("./agent-identity.cjs");

const InstallScenario = {
  NEW: "NEW",
  UPDATE: "UPDATE",
  REPAIR: "REPAIR",
  RECOVERY: "RECOVERY",
  NO_DOWNGRADE: "NO_DOWNGRADE",
};

const INSTALLER_VERSION = "0.1.0";

function readInstalledVersion(productRoot) {
  if (!productRoot) return null;
  const versionFile = path.join(productRoot, "VERSION");
  if (!fs.existsSync(versionFile)) return null;
  try {
    const raw = fs.readFileSync(versionFile, "utf8").trim();
    // e.g. 0.1.0-phase51 → 0.1.0
    const m = raw.match(/^(\d+\.\d+\.\d+)/);
    return m ? m[0] : raw;
  } catch {
    return null;
  }
}

function compareSemver(a, b) {
  const pa = String(a || "0.0.0")
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0.0.0")
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function productBinariesPresent(productRoot) {
  if (!productRoot) return false;
  const gateway =
    fs.existsSync(path.join(productRoot, "gateway", "gateway.cjs")) ||
    fs.existsSync(path.join(productRoot, "gateway", "hub.cjs")) ||
    fs.existsSync(path.join(productRoot, "hub", "hub.cjs"));
  const nodeWin = fs.existsSync(
    path.join(productRoot, "runtime", "node", "node.exe"),
  );
  const nodeUnix = fs.existsSync(
    path.join(productRoot, "runtime", "node", "bin", "node"),
  );
  // On non-Windows packagers, node.exe may be absent — Gateway binary is enough for "installed layout".
  return gateway && (process.platform !== "win32" || nodeWin || nodeUnix);
}

/**
 * @param {{
 *   productRoot: string | null,
 *   onboardingState: string | null,
 *   installerVersion?: string,
 *   processHealthy?: boolean | null,
 * }} input
 */
function classifyInstallScenario(input) {
  const installerVersion = input.installerVersion || INSTALLER_VERSION;
  const cfg = config.loadConfig();
  const data = config.paths();
  const hasConfig = fs.existsSync(data.configFile);
  const hasDb = fs.existsSync(path.join(data.dbDir, "personal-agent.db"));
  const hasIdentity = Boolean(getAgentHostId());
  const hasPairing = hasPersistedPairingAuth();
  const binaries = productBinariesPresent(input.productRoot);
  const installedVersion = readInstalledVersion(input.productRoot);
  const incompleteOnboarding =
    input.onboardingState &&
    input.onboardingState !== "READY" &&
    input.onboardingState !== "ERROR";

  const anyExisting =
    hasConfig ||
    hasDb ||
    hasIdentity ||
    hasPairing ||
    cfg.firstRunComplete ||
    binaries;

  if (!anyExisting) {
    return {
      scenario: InstallScenario.NEW,
      installerVersion,
      installedVersion,
      preserveIdentity: false,
      preservePairing: false,
      preserveDatabase: false,
      reasons: ["no_existing_install"],
    };
  }

  if (
    installedVersion &&
    compareSemver(installedVersion, installerVersion) > 0
  ) {
    return {
      scenario: InstallScenario.NO_DOWNGRADE,
      installerVersion,
      installedVersion,
      preserveIdentity: true,
      preservePairing: true,
      preserveDatabase: true,
      reasons: ["installed_newer_than_installer"],
    };
  }

  if (incompleteOnboarding) {
    return {
      scenario: InstallScenario.RECOVERY,
      installerVersion,
      installedVersion,
      preserveIdentity: hasIdentity || hasPairing,
      preservePairing: hasPairing,
      preserveDatabase: hasDb,
      reasons: ["incomplete_onboarding_state", input.onboardingState],
    };
  }

  const brokenRuntime =
    cfg.firstRunComplete &&
    binaries &&
    input.processHealthy === false;

  if (brokenRuntime) {
    return {
      scenario: InstallScenario.REPAIR,
      installerVersion,
      installedVersion,
      preserveIdentity: true,
      preservePairing: true,
      preserveDatabase: true,
      reasons: ["first_run_complete_but_runtime_unhealthy"],
    };
  }

  if (cfg.firstRunComplete || hasIdentity || hasPairing) {
    return {
      scenario: InstallScenario.UPDATE,
      installerVersion,
      installedVersion,
      preserveIdentity: true,
      preservePairing: true,
      preserveDatabase: true,
      reasons: ["existing_configured_install"],
    };
  }

  return {
    scenario: InstallScenario.RECOVERY,
    installerVersion,
    installedVersion,
    preserveIdentity: hasIdentity || hasPairing,
    preservePairing: hasPairing,
    preserveDatabase: hasDb,
    reasons: ["partial_artifacts_without_complete_first_run"],
  };
}

module.exports = {
  InstallScenario,
  INSTALLER_VERSION,
  classifyInstallScenario,
  compareSemver,
  readInstalledVersion,
  productBinariesPresent,
};
