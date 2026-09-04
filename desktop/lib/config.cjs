"use strict";

/**
 * Persistencia de config del producto (AppData).
 * No es autoridad de ToolPolicy ni auth Gateway — solo prefs del Shell.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

function productDataRoot() {
  if (process.env.PERSONAL_AGENT_DATA_DIR) {
    return process.env.PERSONAL_AGENT_DATA_DIR;
  }
  const base =
    process.env.LOCALAPPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), ".local", "share");
  return path.join(base, "Ideass", "PersonalAgent");
}

function paths() {
  const root = productDataRoot();
  return {
    root,
    configDir: path.join(root, "config"),
    configFile: path.join(root, "config", "product.json"),
    logsDir: path.join(root, "logs"),
    runtimeDir: path.join(root, "runtime"),
    dbDir: path.join(root, "data"),
    /** LocalObjectStorage root (PHASE 57) — no workspace. */
    objectsDir: path.join(root, "objects"),
    /** Encrypted SecretStore fallback root (PHASE 59) — no secrets.json. */
    credentialsDir: path.join(root, "credentials"),
  };
}

function ensureDirs() {
  const p = paths();
  for (const dir of [
    p.configDir,
    p.logsDir,
    p.runtimeDir,
    p.dbDir,
    p.objectsDir,
    p.credentialsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return p;
}

function defaultConfig() {
  return {
    version: 1,
    workspaceRoot: null,
    hubPort: 8787,
    hubToken: null,
    anthropicApiKeySet: false,
    startWithWindows: false,
    firstRunComplete: false,
  };
}

function loadConfig() {
  const p = ensureDirs();
  if (!fs.existsSync(p.configFile)) {
    return defaultConfig();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p.configFile, "utf8"));
    return { ...defaultConfig(), ...raw };
  } catch {
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  const p = ensureDirs();
  const toSave = { ...cfg };
  // Nunca persistir API key en product.json (solo flag).
  delete toSave.anthropicApiKey;
  fs.writeFileSync(p.configFile, JSON.stringify(toSave, null, 2), "utf8");
}

function secretsFile() {
  return path.join(ensureDirs().configDir, "secrets.json");
}

function loadSecrets() {
  const file = secretsFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveSecrets(secrets) {
  const file = secretsFile();
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2), "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows may ignore */
  }
}

function ensureHubToken() {
  const secrets = loadSecrets();
  if (typeof secrets.hubToken === "string" && secrets.hubToken.length >= 16) {
    return secrets.hubToken;
  }
  const token = crypto.randomBytes(32).toString("hex");
  secrets.hubToken = token;
  saveSecrets(secrets);
  const cfg = loadConfig();
  cfg.hubToken = "set";
  saveConfig(cfg);
  return token;
}

function getHubToken() {
  return loadSecrets().hubToken || ensureHubToken();
}

function setAnthropicApiKey(key) {
  const secrets = loadSecrets();
  const trimmed = String(key || "").trim();
  if (trimmed) {
    secrets.anthropicApiKey = trimmed;
  } else {
    delete secrets.anthropicApiKey;
  }
  saveSecrets(secrets);
  const cfg = loadConfig();
  cfg.anthropicApiKeySet = Boolean(trimmed);
  saveConfig(cfg);
}

function getAnthropicApiKey() {
  return loadSecrets().anthropicApiKey || "";
}

function maskToken(token) {
  if (!token || token.length < 8) return "••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

module.exports = {
  productDataRoot,
  paths,
  ensureDirs,
  loadConfig,
  saveConfig,
  loadSecrets,
  saveSecrets,
  ensureHubToken,
  getHubToken,
  setAnthropicApiKey,
  getAnthropicApiKey,
  maskToken,
  defaultConfig,
};
