"use strict";

/**
 * Pairing credential boundary.
 *
 * - Legacy install credential (HUB_TOKEN): transport/auth compatibility for
 *   HTTP Bearer + WS authKind=install. NOT the QR pairing secret.
 * - Trusted-device credentials live in Hub SQLite after QR approve.
 */
const config = require("./config.cjs");

function getPairingStatus() {
  const secrets = config.loadSecrets();
  const token =
    typeof secrets.hubToken === "string" ? secrets.hubToken.trim() : "";
  const present = token.length >= 16;
  return {
    present,
    /** @deprecated name — prefer mechanism */
    mechanism: "LEGACY_INSTALL_CREDENTIAL",
    legacyInstallCredential: present,
    tokenMasked: present ? config.maskToken(token) : null,
  };
}

/**
 * Ensure legacy install credential exists for Hub boot + HTTP pairing control.
 * Does NOT rotate. Does NOT put this value in QR.
 */
function ensurePairingCredentials() {
  const before = getPairingStatus();
  if (before.present) {
    return {
      token: config.getHubToken(),
      created: false,
      mechanism: "LEGACY_INSTALL_CREDENTIAL",
    };
  }
  const token = config.ensureHubToken();
  return {
    token,
    created: true,
    mechanism: "LEGACY_INSTALL_CREDENTIAL",
  };
}

function preserveExistingPairing() {
  const status = getPairingStatus();
  if (status.present) {
    return {
      preserved: true,
      created: false,
      mechanism: "LEGACY_INSTALL_CREDENTIAL",
    };
  }
  const ensured = ensurePairingCredentials();
  return {
    preserved: false,
    created: ensured.created,
    mechanism: ensured.mechanism,
  };
}

/** Bearer token for Desktop → Hub pairing HTTP (install credential). */
function getInstallAuthBearer() {
  return config.getHubToken();
}

module.exports = {
  getPairingStatus,
  ensurePairingCredentials,
  preserveExistingPairing,
  getInstallAuthBearer,
};
