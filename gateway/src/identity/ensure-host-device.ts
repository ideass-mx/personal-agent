/**
 * PHASE 57.10 — Ensure Desktop host is a Trusted Device with publicKey.
 * OWNER_LOCAL only (install_compat + loopback). Idempotent.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/database.ts";
import { ensureLocalIdentity } from "./ensure-local.ts";
import { setTrustedDeviceOwnership } from "./store.ts";
import {
  getTrustedDeviceCrypto,
  isPublicKeyTakenByOtherDevice,
} from "./device-crypto-store.ts";
import { isLikelyEd25519SpkiBase64 } from "../../../packages/device-crypto/index.ts";
import { DEVICE_KEY_ALGORITHM } from "../../../packages/device-crypto/index.ts";
import { touchTrustedDevice } from "../pairing/store.ts";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function ensureHostTrustedDevice(input: {
  deviceId: string;
  publicKey: string;
  deviceName?: string;
  platform?: string;
}):
  | {
      ok: true;
      deviceId: string;
      created: boolean;
      identityStatus: "crypto_enrolled";
    }
  | { ok: false; code: string; message: string } {
  const deviceId = input.deviceId.trim();
  const publicKey = input.publicKey.trim();
  if (!deviceId || !publicKey) {
    return {
      ok: false,
      code: "bad_request",
      message: "deviceId y publicKey son requeridos.",
    };
  }
  if (!isLikelyEd25519SpkiBase64(publicKey)) {
    return {
      ok: false,
      code: "invalid_public_key",
      message: "Clave pública Ed25519 inválida.",
    };
  }
  if (isPublicKeyTakenByOtherDevice(publicKey, deviceId)) {
    return {
      ok: false,
      code: "public_key_conflict",
      message: "La clave pública ya pertenece a otro dispositivo.",
    };
  }

  const identity = ensureLocalIdentity();
  const existing = getTrustedDeviceCrypto(deviceId);

  if (existing?.status === "REVOKED") {
    return {
      ok: false,
      code: "device_revoked",
      message: "Este dispositivo fue revocado.",
    };
  }

  if (
    existing?.status === "ACTIVE" &&
    existing.publicKey &&
    existing.publicKey !== publicKey
  ) {
    return {
      ok: false,
      code: "public_key_mismatch",
      message:
        "Este dispositivo ya tiene otra identidad criptográfica. No se regenera en silencio.",
    };
  }

  if (
    existing?.status === "ACTIVE" &&
    existing.publicKey === publicKey &&
    existing.identityStatus === "crypto_enrolled"
  ) {
    touchTrustedDevice(deviceId);
    return {
      ok: true,
      deviceId,
      created: false,
      identityStatus: "crypto_enrolled",
    };
  }

  const placeholderCred = randomBytes(32).toString("hex");
  const credentialHash = existing
    ? undefined
    : sha256Hex(placeholderCred);
  const name = input.deviceName?.trim() || "Este equipo";
  const platform = input.platform?.trim() || process.platform;

  if (existing) {
    db.prepare(
      `UPDATE trusted_devices
       SET public_key = ?,
           key_algorithm = ?,
           identity_status = 'crypto_enrolled',
           name = COALESCE(?, name),
           platform = COALESCE(?, platform),
           user_id = ?,
           agent_id = ?,
           last_seen = datetime('now'),
           status = 'ACTIVE'
       WHERE device_id = ?`,
    ).run(
      publicKey,
      DEVICE_KEY_ALGORITHM,
      name,
      platform,
      identity.user.id,
      identity.agent.id,
      deviceId,
    );
  } else {
    db.prepare(
      `INSERT INTO trusted_devices
         (device_id, name, platform, paired_at, last_seen, permissions, status,
          credential_hash, user_id, agent_id, public_key, key_algorithm, identity_status)
       VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, 'ACTIVE', ?, ?, ?, ?, ?, 'crypto_enrolled')`,
    ).run(
      deviceId,
      name,
      platform,
      JSON.stringify(["agent.connect"]),
      credentialHash,
      identity.user.id,
      identity.agent.id,
      publicKey,
      DEVICE_KEY_ALGORITHM,
    );
  }

  setTrustedDeviceOwnership(deviceId, {
    userId: identity.user.id,
    agentId: identity.agent.id,
  });
  touchTrustedDevice(deviceId);

  return {
    ok: true,
    deviceId,
    created: !existing,
    identityStatus: "crypto_enrolled",
  };
}
