"use strict";

/**
 * PHASE 57.10 — Desktop host device identity (DeviceKeyStore).
 * Idempotent: same deviceId + publicKey across restarts.
 * Never logs or returns private key material.
 *
 * Prefers in-process Node crypto + DPAPI/seal (no tsx required in packaged builds).
 * Optional CLI fallback for monorepo/dev.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const config = require("./config.cjs");

const DEVICE_ID_RE = /^[0-9a-z][0-9a-z._-]{1,127}$/i;
const KEY_NAMESPACE = "PersonalAgent.DeviceIdentity";
const META_FILE = "meta.json";
const SEALED_FILE = "sealed.dpapi";

function ensureHostDeviceId() {
  const secrets = config.loadSecrets();
  if (
    typeof secrets.deviceId === "string" &&
    DEVICE_ID_RE.test(secrets.deviceId.trim())
  ) {
    return { deviceId: secrets.deviceId.trim(), created: false };
  }
  const deviceId = `desktop-${crypto.randomUUID()}`;
  secrets.deviceId = deviceId;
  config.saveSecrets(secrets);
  return { deviceId, created: true };
}

function getHostDeviceId() {
  const secrets = config.loadSecrets();
  if (
    typeof secrets.deviceId === "string" &&
    DEVICE_ID_RE.test(secrets.deviceId.trim())
  ) {
    return secrets.deviceId.trim();
  }
  return null;
}

function identityDir(deviceId) {
  return path.join(config.productDataRoot(), "device-identity", deviceId);
}

function entropyFor(deviceId) {
  return Buffer.from(`${KEY_NAMESPACE}\n${deviceId}`, "utf8");
}

function loadDpapi() {
  if (process.platform !== "win32") return null;
  try {
    // optionalDependency may live under packages/device-crypto or gateway
    return require("@primno/dpapi").Dpapi;
  } catch {
    try {
      const alt = path.join(
        __dirname,
        "..",
        "..",
        "packages",
        "device-crypto",
        "node_modules",
        "@primno",
        "dpapi",
      );
      return require(alt).Dpapi;
    } catch {
      return null;
    }
  }
}

function createSeal(deviceId) {
  const Dpapi = loadDpapi();
  if (Dpapi) {
    return {
      protect(buf) {
        return Buffer.from(
          Dpapi.protectData(buf, entropyFor(deviceId), "CurrentUser"),
        );
      },
      unprotect(buf) {
        return Buffer.from(
          Dpapi.unprotectData(buf, entropyFor(deviceId), "CurrentUser"),
        );
      },
    };
  }
  // Dev / non-Windows: AES-GCM with stable key (NOT production Windows).
  const key = crypto.createHash("sha256").update(`PA-DEV-SEAL:${deviceId}`).digest();
  return {
    protect(plaintext) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]);
    },
    unprotect(ciphertext) {
      const iv = ciphertext.subarray(0, 12);
      const tag = ciphertext.subarray(12, 28);
      const enc = ciphertext.subarray(28);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]);
    },
  };
}

function readMeta(dir) {
  const p = path.join(dir, META_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (
      raw?.version !== 1 ||
      raw.namespace !== KEY_NAMESPACE ||
      typeof raw.deviceId !== "string" ||
      typeof raw.publicKey !== "string" ||
      raw.keyAlgorithm !== "Ed25519"
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * In-process DeviceKeyStore (mirrors packages/device-crypto WindowsDeviceKeyStore).
 */
function ensureHostDeviceCryptoInProcess() {
  const { deviceId } = ensureHostDeviceId();
  const dir = identityDir(deviceId);
  fs.mkdirSync(dir, { recursive: true });
  const seal = createSeal(deviceId);
  const meta = readMeta(dir);
  const sealedPath = path.join(dir, SEALED_FILE);

  if (meta && meta.deviceId === deviceId && fs.existsSync(sealedPath)) {
    return {
      ok: true,
      deviceId,
      publicKey: meta.publicKey,
      keyAlgorithm: "Ed25519",
      created: false,
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeySpki = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  try {
    const sealed = seal.protect(pkcs8);
    fs.writeFileSync(sealedPath, sealed, { mode: 0o600 });
    fs.writeFileSync(
      path.join(dir, META_FILE),
      JSON.stringify({
        version: 1,
        namespace: KEY_NAMESPACE,
        deviceId,
        publicKey: publicKeySpki,
        keyAlgorithm: "Ed25519",
      }),
      { encoding: "utf8", mode: 0o600 },
    );
  } finally {
    pkcs8.fill(0);
  }
  return {
    ok: true,
    deviceId,
    publicKey: publicKeySpki,
    keyAlgorithm: "Ed25519",
    created: true,
  };
}

function ensureHostDeviceCrypto(productRoot, nodeCmd = "node") {
  try {
    return ensureHostDeviceCryptoInProcess();
  } catch {
    // Fallback: monorepo CLI (dev only)
    const script = path.join(
      productRoot || "",
      "packages",
      "device-crypto",
      "scripts",
      "ensure-host-cli.ts",
    );
    if (!productRoot || !fs.existsSync(script)) {
      return { ok: false, error: "device_identity_unavailable" };
    }
    const tsxCli = [
      path.join(productRoot, "gateway", "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(productRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    ].find((p) => fs.existsSync(p));
    const { deviceId } = ensureHostDeviceId();
    const dataRoot = config.productDataRoot();
    const args = tsxCli
      ? [tsxCli, script, deviceId, dataRoot]
      : ["--import", "tsx", script, deviceId, dataRoot];
    const r = spawnSync(nodeCmd, args, {
      encoding: "utf8",
      env: { ...process.env, PA_DEVICE_KEYSTORE_MEMORY: "1" },
      timeout: 30_000,
    });
    if (r.error || r.status !== 0) {
      return { ok: false, error: "device_identity_unavailable" };
    }
    try {
      const line = String(r.stdout || "")
        .trim()
        .split("\n")
        .filter(Boolean)
        .pop();
      const json = JSON.parse(line);
      if (!json.ok || !json.publicKey) {
        return { ok: false, error: "device_identity_unavailable" };
      }
      return {
        ok: true,
        deviceId: json.deviceId,
        publicKey: json.publicKey,
        keyAlgorithm: json.keyAlgorithm || "Ed25519",
        created: Boolean(json.created),
      };
    } catch {
      return { ok: false, error: "device_identity_unavailable" };
    }
  }
}

function enrollHostWithGateway({ port, hubToken, deviceId, publicKey }) {
  const http = require("node:http");
  const payload = JSON.stringify({
    deviceId,
    publicKey,
    deviceName: "Este equipo",
    platform: process.platform === "win32" ? "windows" : process.platform,
  });
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/v1/device-auth/ensure-host",
        method: "POST",
        timeout: 5000,
        headers: {
          Authorization: `Bearer ${hubToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Accept: "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode === 200 && json.ok === true) {
              resolve({ ok: true, created: Boolean(json.created) });
              return;
            }
          } catch {
            /* fallthrough */
          }
          resolve({ ok: false, error: "host_enroll_failed" });
        });
      },
    );
    req.on("error", () => resolve({ ok: false, error: "host_enroll_failed" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "host_enroll_timeout" });
    });
    req.write(payload);
    req.end();
  });
}

async function ensureHostDeviceEnrollment({
  productRoot,
  port,
  hubToken,
  nodeCmd = "node",
  log,
}) {
  const local = ensureHostDeviceCrypto(productRoot, nodeCmd);
  if (!local.ok) {
    log?.("HOST", "device_identity_failed", { error: local.error });
    return {
      ok: false,
      error: local.error,
      userMessage: "No pudimos preparar este dispositivo. Inténtalo de nuevo.",
    };
  }
  const enrolled = await enrollHostWithGateway({
    port,
    hubToken,
    deviceId: local.deviceId,
    publicKey: local.publicKey,
  });
  if (!enrolled.ok) {
    log?.("HOST", "device_enroll_failed", { error: enrolled.error });
    return {
      ok: false,
      error: enrolled.error,
      userMessage: "No pudimos preparar este dispositivo. Inténtalo de nuevo.",
      deviceId: local.deviceId,
    };
  }
  log?.("HOST", "device_identity_ready", {
    deviceId: local.deviceId,
    created: local.created || enrolled.created,
  });
  return {
    ok: true,
    deviceId: local.deviceId,
    publicKey: local.publicKey,
    created: local.created || enrolled.created,
  };
}

module.exports = {
  ensureHostDeviceId,
  getHostDeviceId,
  ensureHostDeviceCrypto,
  ensureHostDeviceCryptoInProcess,
  enrollHostWithGateway,
  ensureHostDeviceEnrollment,
};
