"use strict";

/**
 * Persistent onboarding state machine (recoverable after restart / failure).
 * Lives in AppData — not in the install dir — so updates preserve progress.
 *
 * Agent Runtime must NOT be treated as operable until Tailscale READY
 * (networkReady === true) AND onboarding has reached NETWORK_READY or later.
 */
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config.cjs");
const { logOnboarding } = require("./onboarding-log.cjs");

const OnboardingState = {
  PREFLIGHT: "PREFLIGHT",
  NETWORK_INSTALLING: "NETWORK_INSTALLING",
  NETWORK_AUTHENTICATION: "NETWORK_AUTHENTICATION",
  NETWORK_VERIFYING: "NETWORK_VERIFYING",
  NETWORK_READY: "NETWORK_READY",
  AGENT_PROVISIONING: "AGENT_PROVISIONING",
  AGENT_INITIALIZING: "AGENT_INITIALIZING",
  AGENT_READY: "AGENT_READY",
  PAIRING: "PAIRING",
  CONFIGURING: "CONFIGURING",
  READY: "READY",
  ERROR: "ERROR",
};

/** Canonical ordered stages for recovery resume. */
const STAGE_ORDER = [
  OnboardingState.PREFLIGHT,
  OnboardingState.NETWORK_INSTALLING,
  OnboardingState.NETWORK_AUTHENTICATION,
  OnboardingState.NETWORK_VERIFYING,
  OnboardingState.NETWORK_READY,
  OnboardingState.AGENT_PROVISIONING,
  OnboardingState.AGENT_INITIALIZING,
  OnboardingState.AGENT_READY,
  OnboardingState.PAIRING,
  OnboardingState.CONFIGURING,
  OnboardingState.READY,
];

const ALLOWED = new Set(Object.values(OnboardingState));

/** Legacy persist value → current. */
function migrateStateName(state) {
  if (state === "AGENT_INSTALLING") return OnboardingState.AGENT_PROVISIONING;
  return state;
}

function onboardingFile() {
  return path.join(config.ensureDirs().configDir, "onboarding.json");
}

function defaultRecord() {
  return {
    version: 1,
    state: OnboardingState.PREFLIGHT,
    scenario: null,
    lastError: null,
    lastErrorCode: null,
    networkReadyAt: null,
    agentReadyAt: null,
    pairingSkipped: false,
    pairingConfirmedAt: null,
    updatedAt: null,
  };
}

function loadOnboarding() {
  const file = onboardingFile();
  if (!fs.existsSync(file)) return defaultRecord();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const base = defaultRecord();
    let state = migrateStateName(raw.state);
    if (!ALLOWED.has(state)) state = OnboardingState.PREFLIGHT;
    const record = { ...base, ...raw, state };
    // Persist migration so recovery does not see AGENT_INSTALLING again.
    if (raw.state === "AGENT_INSTALLING") {
      try {
        fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
      } catch {
        /* ignore */
      }
    }
    return record;
  } catch {
    return defaultRecord();
  }
}

function saveOnboarding(record) {
  const next = {
    ...defaultRecord(),
    ...record,
    state: migrateStateName(record.state),
    updatedAt: new Date().toISOString(),
  };
  if (!ALLOWED.has(next.state)) {
    throw new Error(`invalid_onboarding_state:${next.state}`);
  }
  fs.writeFileSync(onboardingFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function setOnboardingState(state, patch = {}) {
  const cur = loadOnboarding();
  const nextState = migrateStateName(state);
  // PHASE 65.2 invariant: PREFLIGHT must never transition to PREFLIGHT
  // (no polling via transition(PREFLIGHT)). Metadata-only patches are OK.
  if (
    cur.state === OnboardingState.PREFLIGHT &&
    nextState === OnboardingState.PREFLIGHT
  ) {
    const next = saveOnboarding({
      ...cur,
      ...patch,
      state: OnboardingState.PREFLIGHT,
      lastError:
        patch.lastError !== undefined ? patch.lastError : cur.lastError,
      lastErrorCode:
        patch.lastErrorCode !== undefined
          ? patch.lastErrorCode
          : cur.lastErrorCode,
    });
    logOnboarding(next.state, "patch", {
      from: cur.state,
      to: next.state,
      scenario: next.scenario,
      reason: patch.reason || "preflight_metadata_only",
    });
    return next;
  }
  const next = saveOnboarding({
    ...cur,
    ...patch,
    state: nextState,
    lastError: patch.lastError !== undefined ? patch.lastError : cur.lastError,
    lastErrorCode:
      patch.lastErrorCode !== undefined
        ? patch.lastErrorCode
        : nextState === OnboardingState.ERROR
          ? cur.lastErrorCode
          : null,
  });
  logOnboarding(next.state, "transition", {
    from: cur.state,
    to: next.state,
    scenario: next.scenario,
    reason: patch.reason || undefined,
    errorCode: next.lastErrorCode,
  });
  return next;
}

function setOnboardingError(code, message) {
  return setOnboardingState(OnboardingState.ERROR, {
    lastErrorCode: code,
    lastError: String(message || code),
  });
}

function migrateLegacyIfNeeded() {
  const cur = loadOnboarding();
  if (cur.updatedAt) return cur;
  const cfg = config.loadConfig();
  if (cfg.firstRunComplete && cfg.workspaceRoot) {
    return saveOnboarding({
      ...cur,
      state: OnboardingState.NETWORK_VERIFYING,
      scenario: "UPDATE",
      updatedAt: new Date().toISOString(),
    });
  }
  return cur;
}

/**
 * May start/provision Agent only if Tailscale READY and onboarding past network.
 * @param {object} [record]
 * @param {{ networkReady?: boolean }} [opts]
 */
function canStartAgentRuntime(record, opts = {}) {
  if (opts.networkReady !== true) return false;
  const r = record || loadOnboarding();
  const state = migrateStateName(r.state);
  return (
    state === OnboardingState.NETWORK_READY ||
    state === OnboardingState.AGENT_PROVISIONING ||
    state === OnboardingState.AGENT_INITIALIZING ||
    state === OnboardingState.AGENT_READY ||
    state === OnboardingState.PAIRING ||
    state === OnboardingState.CONFIGURING ||
    state === OnboardingState.READY
  );
}

/** Product READY requires Tailscale READY + onboarding READY. */
function isProductReady(record, opts = {}) {
  if (opts.networkReady !== true) return false;
  const r = record || loadOnboarding();
  return migrateStateName(r.state) === OnboardingState.READY;
}

function stageIndex(state) {
  const i = STAGE_ORDER.indexOf(migrateStateName(state));
  return i < 0 ? 0 : i;
}

module.exports = {
  OnboardingState,
  STAGE_ORDER,
  loadOnboarding,
  saveOnboarding,
  setOnboardingState,
  setOnboardingError,
  migrateLegacyIfNeeded,
  canStartAgentRuntime,
  isProductReady,
  stageIndex,
  onboardingFile,
  migrateStateName,
};
