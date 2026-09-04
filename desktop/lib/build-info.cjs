"use strict";

/**
 * Lee build-info.json del product root (Fase 7.5).
 * Electron no es source of truth — solo reporta metadata empaquetada.
 */
const fs = require("node:fs");
const path = require("node:path");

function readBuildInfo(productRoot) {
  if (!productRoot) return null;
  const file = path.join(productRoot, "build-info.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!raw || typeof raw.version !== "string") return null;
    return {
      product: String(raw.product || "personal-agent"),
      version: String(raw.version),
      build: String(raw.build || "unknown"),
      commit: String(raw.commit || "unknown"),
      platform: String(raw.platform || "windows"),
      architecture: String(raw.architecture || "x64"),
      builtAt: String(raw.builtAt || "unknown"),
      channel: raw.channel ? String(raw.channel) : undefined,
    };
  } catch {
    return null;
  }
}

function readVersionFile(productRoot) {
  if (!productRoot) return null;
  const versionFile = path.join(productRoot, "VERSION");
  if (!fs.existsSync(versionFile)) return null;
  try {
    const raw = fs.readFileSync(versionFile, "utf8").trim();
    const m = raw.match(/^(\d+\.\d+\.\d+)/);
    return m ? m[0] : raw;
  } catch {
    return null;
  }
}

/**
 * Versión SemVer del producto instalado (build-info → VERSION → fallback).
 */
function resolveProductVersion(productRoot, fallback = "0.1.0") {
  const info = readBuildInfo(productRoot);
  if (info?.version) return info.version;
  return readVersionFile(productRoot) || fallback;
}

module.exports = {
  readBuildInfo,
  readVersionFile,
  resolveProductVersion,
};
