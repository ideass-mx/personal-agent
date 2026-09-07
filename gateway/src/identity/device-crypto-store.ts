/**
 * PHASE 57.8 — Device crypto identity on Gateway (public key only).
 */
import { db } from "../db/database.ts";
import type { TrustedDeviceStatus } from "../pairing/store.ts";
import { isLikelyEd25519SpkiBase64 } from "../../../packages/device-crypto/index.ts";
import { DEVICE_KEY_ALGORITHM } from "../../../packages/device-crypto/index.ts";

export type DeviceIdentityStatus = "legacy" | "crypto_enrolled";

export type TrustedDeviceCryptoRow = {
  deviceId: string;
  status: TrustedDeviceStatus;
  publicKey: string | null;
  keyAlgorithm: string | null;
  identityStatus: DeviceIdentityStatus;
  userId: string | null;
  agentId: string | null;
};

export function getTrustedDeviceCrypto(
  deviceId: string,
): TrustedDeviceCryptoRow | null {
  const row = db
    .prepare(
      `SELECT device_id AS deviceId, status,
              public_key AS publicKey, key_algorithm AS keyAlgorithm,
              identity_status AS identityStatus,
              user_id AS userId, agent_id AS agentId
       FROM trusted_devices WHERE device_id = ?`,
    )
    .get(deviceId) as
    | {
        deviceId: string;
        status: TrustedDeviceStatus;
        publicKey: string | null;
        keyAlgorithm: string | null;
        identityStatus: string;
        userId: string | null;
        agentId: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    ...row,
    identityStatus:
      row.identityStatus === "crypto_enrolled" ? "crypto_enrolled" : "legacy",
  };
}

/** True if another ACTIVE device already uses this public key. */
export function isPublicKeyTakenByOtherDevice(
  publicKey: string,
  exceptDeviceId?: string,
): boolean {
  const row = db
    .prepare(
      `SELECT device_id AS deviceId FROM trusted_devices
       WHERE public_key = ? AND status = 'ACTIVE'
         AND (? IS NULL OR device_id != ?)`,
    )
    .get(publicKey, exceptDeviceId ?? null, exceptDeviceId ?? null) as
    | { deviceId: string }
    | undefined;
  return !!row;
}

export function setDevicePublicKey(input: {
  deviceId: string;
  publicKey: string;
  keyAlgorithm?: string;
}):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  const algo = input.keyAlgorithm ?? DEVICE_KEY_ALGORITHM;
  if (algo !== DEVICE_KEY_ALGORITHM) {
    return {
      ok: false,
      code: "unsupported_algorithm",
      message: "Solo se admite Ed25519.",
    };
  }
  if (!isLikelyEd25519SpkiBase64(input.publicKey)) {
    return {
      ok: false,
      code: "invalid_public_key",
      message: "Clave pública Ed25519 inválida.",
    };
  }
  const device = getTrustedDeviceCrypto(input.deviceId);
  if (!device) {
    return {
      ok: false,
      code: "not_found",
      message: "Dispositivo desconocido.",
    };
  }
  if (device.status !== "ACTIVE") {
    return {
      ok: false,
      code: "device_revoked",
      message: "Dispositivo revocado.",
    };
  }
  if (isPublicKeyTakenByOtherDevice(input.publicKey, input.deviceId)) {
    return {
      ok: false,
      code: "public_key_conflict",
      message: "La clave pública ya está registrada en otro dispositivo.",
    };
  }
  db.prepare(
    `UPDATE trusted_devices
     SET public_key = ?,
         key_algorithm = ?,
         identity_status = 'crypto_enrolled',
         last_seen = datetime('now')
     WHERE device_id = ? AND status = 'ACTIVE'`,
  ).run(input.publicKey, DEVICE_KEY_ALGORITHM, input.deviceId);
  return { ok: true };
}

export function clearDevicePublicKeyOnRevoke(deviceId: string): void {
  db.prepare(
    `UPDATE trusted_devices
     SET public_key = NULL,
         key_algorithm = NULL,
         identity_status = 'legacy',
         credential_hash = ''
     WHERE device_id = ?`,
  ).run(deviceId);
}
