"use strict";

/**
 * PHASE 58 final — purge LLM / install secrets under product data root.
 * Mirrors the mandatory paths in installer/windows/personal-agent.iss.
 * Does NOT delete workspace / Documents / arbitrary user files.
 */
const fs = require("node:fs");
const path = require("node:path");

function rmFile(p) {
  try {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) fs.unlinkSync(p);
  } catch {
    /* best-effort */
  }
}

function rmTree(dir) {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * @param {string} productRoot e.g. %LOCALAPPDATA%\Ideass\PersonalAgent
 * @returns {{ removed: string[] }}
 */
function purgeInstallSecrets(productRoot) {
  const root = path.resolve(productRoot);
  const removed = [];
  const secretsJson = path.join(root, "config", "secrets.json");
  const legacyKey = path.join(root, "credentials", "anthropic.api_key");
  const llmDir = path.join(root, "credentials", "llm");
  const credentialsDir = path.join(root, "credentials");
  const configDir = path.join(root, "config");
  const deviceIdentityDir = path.join(root, "device-identity");
  const runtimeDir = path.join(root, "runtime");

  // Explicit LLM paths first (inventory: Desktop secrets.json + Gateway llm files).
  if (fs.existsSync(secretsJson)) {
    rmFile(secretsJson);
    removed.push(secretsJson);
  }
  if (fs.existsSync(legacyKey)) {
    rmFile(legacyKey);
    removed.push(legacyKey);
  }
  if (fs.existsSync(llmDir)) {
    rmTree(llmDir);
    removed.push(llmDir);
  }

  // Full credential / config / device identity trees (no silent re-auth / key restore).
  for (const dir of [credentialsDir, configDir, deviceIdentityDir, runtimeDir]) {
    if (fs.existsSync(dir)) {
      rmTree(dir);
      removed.push(dir);
    }
  }

  return { removed };
}

/** True if any known LLM secret file still exists under product root. */
function llmSecretsPresent(productRoot) {
  const root = path.resolve(productRoot);
  const candidates = [
    path.join(root, "config", "secrets.json"),
    path.join(root, "credentials", "anthropic.api_key"),
    path.join(root, "credentials", "llm", "anthropic.api_key"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    if (p.endsWith("secrets.json")) {
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        if (j && typeof j.anthropicApiKey === "string" && j.anthropicApiKey.trim()) {
          return true;
        }
      } catch {
        return true;
      }
      continue;
    }
    try {
      if (fs.readFileSync(p, "utf8").trim().length > 0) return true;
    } catch {
      return true;
    }
  }
  return false;
}

module.exports = {
  purgeInstallSecrets,
  llmSecretsPresent,
};
