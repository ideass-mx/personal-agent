"use strict";

/**
 * Persistent Agent identity (not Tailscale, not Android pairing).
 * Canonical field: agentId. Migrates legacy agentHostId → agentId once.
 *
 * install credential (HUB_TOKEN) ≠ trusted device credential ≠ pairing QR secret.
 */
const crypto = require("node:crypto");
const config = require("./config.cjs");

const ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidAgentId(id) {
  return typeof id === "string" && ID_RE.test(id.trim());
}

/**
 * Returns existing agentId (or migrates agentHostId) or creates once.
 */
function ensureAgentId() {
  const secrets = config.loadSecrets();
  if (isValidAgentId(secrets.agentId)) {
    return { id: secrets.agentId, created: false, migrated: false };
  }
  if (isValidAgentId(secrets.agentHostId)) {
    secrets.agentId = secrets.agentHostId;
    config.saveSecrets(secrets);
    return { id: secrets.agentId, created: false, migrated: true };
  }
  const id = crypto.randomUUID();
  secrets.agentId = id;
  // Keep legacy key in sync during transition.
  secrets.agentHostId = id;
  config.saveSecrets(secrets);
  return { id, created: true, migrated: false };
}

function getAgentId() {
  const secrets = config.loadSecrets();
  if (isValidAgentId(secrets.agentId)) return secrets.agentId;
  if (isValidAgentId(secrets.agentHostId)) return secrets.agentHostId;
  return null;
}

/** @deprecated use ensureAgentId / getAgentId */
function ensureAgentHostId() {
  const r = ensureAgentId();
  return { id: r.id, created: r.created };
}

/** @deprecated use getAgentId */
function getAgentHostId() {
  return getAgentId();
}

/**
 * True when the legacy install credential (HUB_TOKEN) exists locally.
 * This is NOT evidence of a trusted mobile device.
 * install credential != trusted device credential
 */
function hasPersistedInstallCredential() {
  const { getPairingStatus } = require("./pairing.cjs");
  return Boolean(getPairingStatus().legacyInstallCredential);
}

/**
 * @deprecated Historical name. Means install credential present — NOT trusted device.
 * Prefer hasPersistedInstallCredential().
 */
function hasPersistedPairingAuth() {
  return hasPersistedInstallCredential();
}

module.exports = {
  ensureAgentId,
  getAgentId,
  isValidAgentId,
  ensureAgentHostId,
  getAgentHostId,
  isValidAgentHostId: isValidAgentId,
  hasPersistedInstallCredential,
  hasPersistedPairingAuth,
};
