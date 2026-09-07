/**
 * Pairing Session + Trusted Device (SQLite).
 * Pairing secrets: only hash persisted; plaintext shown once (QR / approve).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../db/database.ts";
import { ensureLocalIdentity } from "../identity/ensure-local.ts";
import { setTrustedDeviceOwnership } from "../identity/store.ts";
import { isLikelyEd25519SpkiBase64 } from "../../../packages/device-crypto/index.ts";

export const PAIRING_TTL_MS = 5 * 60 * 1000;

export type PairingStatus =
  | "PENDING"
  | "AWAITING_CONFIRMATION"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CONSUMED";

export type TrustedDeviceStatus = "ACTIVE" | "REVOKED";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function expireOverdue(): void {
  db.prepare(
    `UPDATE pairing_sessions SET status = 'EXPIRED'
     WHERE status IN ('PENDING', 'AWAITING_CONFIRMATION')
       AND expires_at < datetime('now')`,
  ).run();
}

export function createPairingSession(): {
  id: string;
  secret: string;
  expiresAt: string;
  ttlMs: number;
} {
  expireOverdue();
  const id = `ps_${randomBytes(16).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");
  const secretHash = sha256Hex(secret);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  db
    .prepare(
      `INSERT INTO pairing_sessions (id, secret_hash, status, expires_at)
       VALUES (?, ?, 'PENDING', ?)`,
    )
    .run(id, secretHash, expiresAt);
  return { id, secret, expiresAt, ttlMs: PAIRING_TTL_MS };
}

export function getPairingSession(id: string): {
  id: string;
  status: PairingStatus;
  expiresAt: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  publicKey: string | null;
  keyAlgorithm: string | null;
} | null {
  expireOverdue();
  const row = db
    .prepare(
      `SELECT id, status, expires_at AS expiresAt, device_id AS deviceId,
              device_name AS deviceName, platform,
              public_key AS publicKey, key_algorithm AS keyAlgorithm
       FROM pairing_sessions WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        status: PairingStatus;
        expiresAt: string;
        deviceId: string | null;
        deviceName: string | null;
        platform: string | null;
        publicKey: string | null;
        keyAlgorithm: string | null;
      }
    | undefined;
  return row ?? null;
}

/** Validate QR secret; move PENDING ? AWAITING_CONFIRMATION (once). */
export function acceptPairingRequest(input: {
  pairingSessionId: string;
  pairingSecret: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  /** SPKI base64; private key never sent (PHASE 57.8). */
  publicKey?: string;
  keyAlgorithm?: string;
}):
  | { ok: true }
  | {
      ok: false;
      code: "pairing_invalid" | "pairing_expired" | "pairing_rejected";
      message: string;
    } {
  expireOverdue();
  const row = db
    .prepare(
      `SELECT id, secret_hash AS secretHash, status, expires_at AS expiresAt,
              device_id AS deviceId
       FROM pairing_sessions WHERE id = ?`,
    )
    .get(input.pairingSessionId) as
    | {
        id: string;
        secretHash: string;
        status: PairingStatus;
        expiresAt: string;
        deviceId: string | null;
      }
    | undefined;

  if (!row) {
    return {
      ok: false,
      code: "pairing_invalid",
      message: "Sesion de pairing desconocida.",
    };
  }
  if (row.status === "EXPIRED" || new Date(row.expiresAt).getTime() < Date.now()) {
    db
      .prepare(`UPDATE pairing_sessions SET status = 'EXPIRED' WHERE id = ?`)
      .run(row.id);
    return {
      ok: false,
      code: "pairing_expired",
      message: "La sesion de pairing expiro.",
    };
  }
  if (row.status === "REJECTED") {
    return {
      ok: false,
      code: "pairing_rejected",
      message: "La sesion de pairing fue rechazada.",
    };
  }
  if (row.status === "CONSUMED" || row.status === "APPROVED") {
    return {
      ok: false,
      code: "pairing_invalid",
      message: "La sesion de pairing ya fue usada.",
    };
  }

  const candidate = sha256Hex(input.pairingSecret);
  if (!safeEqualHex(candidate, row.secretHash)) {
    return {
      ok: false,
      code: "pairing_invalid",
      message: "Secreto de pairing invalido.",
    };
  }

  // Idempotent: same device already awaiting confirmation.
  if (row.status === "AWAITING_CONFIRMATION") {
    if (row.deviceId === input.deviceId) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "pairing_invalid",
      message: "La sesion de pairing ya tiene otro dispositivo pendiente.",
    };
  }

  if (row.status !== "PENDING") {
    return {
      ok: false,
      code: "pairing_invalid",
      message: "Estado de pairing invalido.",
    };
  }

  // Atomic: only the first PENDING ? AWAITING wins.
  const publicKey = input.publicKey?.trim() || null;
  const keyAlgorithm =
    publicKey && (input.keyAlgorithm === "Ed25519" || !input.keyAlgorithm)
      ? "Ed25519"
      : null;
  if (publicKey) {
    if (keyAlgorithm !== "Ed25519") {
      return {
        ok: false,
        code: "pairing_invalid",
        message: "keyAlgorithm debe ser Ed25519.",
      };
    }
    if (!isLikelyEd25519SpkiBase64(publicKey)) {
      return {
        ok: false,
        code: "pairing_invalid",
        message: "publicKey Ed25519 inválida.",
      };
    }
  }

  const updated = db
    .prepare(
      `UPDATE pairing_sessions
       SET status = 'AWAITING_CONFIRMATION',
           device_id = ?, device_name = ?, platform = ?,
           public_key = ?, key_algorithm = ?
       WHERE id = ? AND status = 'PENDING'`,
    )
    .run(
      input.deviceId,
      input.deviceName ?? null,
      input.platform ?? null,
      publicKey,
      keyAlgorithm,
      row.id,
    );

  if (updated.changes !== 1) {
    const again = getPairingSession(row.id);
    if (
      again?.status === "AWAITING_CONFIRMATION" &&
      again.deviceId === input.deviceId
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "pairing_invalid",
      message: "La sesion de pairing ya fue reclamada por otro dispositivo.",
    };
  }
  return { ok: true };
}

export function listAwaitingConfirmation(): Array<{
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  expiresAt: string;
}> {
  expireOverdue();
  return db
    .prepare(
      `SELECT id, device_id AS deviceId, device_name AS deviceName,
              platform, expires_at AS expiresAt
       FROM pairing_sessions
       WHERE status = 'AWAITING_CONFIRMATION'
       ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string;
    deviceId: string | null;
    deviceName: string | null;
    platform: string | null;
    expiresAt: string;
  }>;
}

/**
 * Approve: create TrustedDevice + device credential (plaintext returned once).
 * Marks session CONSUMED. Atomic: second approve fails.
 */
export function approvePairingSession(id: string):
  | {
      ok: true;
      deviceId: string;
      deviceCredential: string;
      deviceName: string | null;
      platform: string | null;
    }
  | { ok: false; code: string; message: string } {
  expireOverdue();
  const row = getPairingSession(id);
  if (!row) {
    return { ok: false, code: "pairing_invalid", message: "Sesion desconocida." };
  }
  if (row.status === "EXPIRED") {
    return { ok: false, code: "pairing_expired", message: "Sesion expirada." };
  }
  if (row.status === "CONSUMED") {
    return {
      ok: false,
      code: "pairing_already_approved",
      message: "La sesion ya fue aprobada.",
    };
  }
  if (row.status !== "AWAITING_CONFIRMATION") {
    return {
      ok: false,
      code: "pairing_invalid",
      message: `Estado ${row.status}; se esperaba AWAITING_CONFIRMATION.`,
    };
  }
  if (!row.deviceId) {
    return {
      ok: false,
      code: "pairing_invalid",
      message: "Sin deviceId en la sesion.",
    };
  }

  const deviceCredential = randomBytes(32).toString("hex");
  const credentialHash = sha256Hex(deviceCredential);
  const deviceId = row.deviceId;
  const deviceName = row.deviceName;
  const platform = row.platform;
  const publicKey = row.publicKey;
  const keyAlgorithm = row.keyAlgorithm;
  const identity = ensureLocalIdentity();
  const identityStatus =
    publicKey && keyAlgorithm === "Ed25519" ? "crypto_enrolled" : "legacy";

  if (publicKey) {
    const taken = db
      .prepare(
        `SELECT device_id FROM trusted_devices
         WHERE public_key = ? AND status = 'ACTIVE' AND device_id != ?`,
      )
      .get(publicKey, deviceId) as { device_id: string } | undefined;
    if (taken) {
      return {
        ok: false,
        code: "public_key_conflict",
        message: "La clave pública ya pertenece a otro dispositivo activo.",
      };
    }
  }

  let approved = false;
  const tx = db.transaction(() => {
    const consumed = db
      .prepare(
        `UPDATE pairing_sessions
         SET status = 'CONSUMED', consumed_at = datetime('now')
         WHERE id = ? AND status = 'AWAITING_CONFIRMATION'`,
      )
      .run(id);
    if (consumed.changes !== 1) {
      return;
    }
    db.prepare(
      `INSERT INTO trusted_devices
         (device_id, name, platform, paired_at, last_seen, permissions, status,
          credential_hash, user_id, agent_id, public_key, key_algorithm, identity_status)
       VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         name = excluded.name,
         platform = COALESCE(excluded.platform, platform),
         last_seen = datetime('now'),
         status = 'ACTIVE',
         credential_hash = excluded.credential_hash,
         user_id = excluded.user_id,
         agent_id = excluded.agent_id,
         public_key = excluded.public_key,
         key_algorithm = excluded.key_algorithm,
         identity_status = excluded.identity_status`,
    ).run(
      deviceId,
      deviceName,
      platform,
      JSON.stringify(["agent.connect"]),
      credentialHash,
      identity.user.id,
      identity.agent.id,
      publicKey,
      keyAlgorithm,
      identityStatus,
    );
    approved = true;
  });
  tx();

  if (!approved) {
    return {
      ok: false,
      code: "pairing_already_approved",
      message: "La sesion ya fue aprobada.",
    };
  }

  setTrustedDeviceOwnership(deviceId, {
    userId: identity.user.id,
    agentId: identity.agent.id,
  });

  return {
    ok: true,
    deviceId,
    deviceCredential,
    deviceName,
    platform,
  };
}

export function rejectPairingSession(id: string):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  expireOverdue();
  const row = getPairingSession(id);
  if (!row) {
    return { ok: false, code: "pairing_invalid", message: "Sesion desconocida." };
  }
  if (
    row.status !== "PENDING" &&
    row.status !== "AWAITING_CONFIRMATION"
  ) {
    return {
      ok: false,
      code: "pairing_invalid",
      message: `No se puede rechazar en estado ${row.status}.`,
    };
  }
  db
    .prepare(`UPDATE pairing_sessions SET status = 'REJECTED' WHERE id = ?`)
    .run(id);
  return { ok: true };
}

export function verifyDeviceCredential(
  deviceId: string,
  credential: string,
): boolean {
  const row = db
    .prepare(
      `SELECT credential_hash AS credentialHash, status
       FROM trusted_devices WHERE device_id = ?`,
    )
    .get(deviceId) as
    | { credentialHash: string; status: TrustedDeviceStatus }
    | undefined;
  if (!row || row.status !== "ACTIVE") return false;
  return safeEqualHex(sha256Hex(credential), row.credentialHash);
}

/**
 * ACTIVE ? REVOKED. Credential can never authenticate again.
 * Idempotent if already REVOKED.
 */
export function revokeTrustedDevice(deviceId: string):
  | { ok: true; status: TrustedDeviceStatus; alreadyRevoked: boolean }
  | { ok: false; code: string; message: string } {
  const row = db
    .prepare(
      `SELECT status FROM trusted_devices WHERE device_id = ?`,
    )
    .get(deviceId) as { status: TrustedDeviceStatus } | undefined;
  if (!row) {
    return {
      ok: false,
      code: "not_found",
      message: "Dispositivo de confianza desconocido.",
    };
  }
  if (row.status === "REVOKED") {
    return { ok: true, status: "REVOKED", alreadyRevoked: true };
  }
  db.prepare(
    `UPDATE trusted_devices
     SET status = 'REVOKED',
         credential_hash = '',
         public_key = NULL,
         key_algorithm = NULL,
         identity_status = 'legacy',
         last_seen = datetime('now')
     WHERE device_id = ? AND status = 'ACTIVE'`,
  ).run(deviceId);
  return { ok: true, status: "REVOKED", alreadyRevoked: false };
}

/** Ownership columns on trusted_devices (PHASE 57.2); null if unknown device. */
export function getTrustedDeviceOwnership(
  deviceId: string,
): { userId: string | null; agentId: string | null; status: TrustedDeviceStatus } | null {
  const row = db
    .prepare(
      `SELECT user_id AS userId, agent_id AS agentId, status
       FROM trusted_devices WHERE device_id = ?`,
    )
    .get(deviceId) as
    | {
        userId: string | null;
        agentId: string | null;
        status: TrustedDeviceStatus;
      }
    | undefined;
  return row ?? null;
}

export function touchTrustedDevice(deviceId: string): void {
  db
    .prepare(
      `UPDATE trusted_devices SET last_seen = datetime('now')
       WHERE device_id = ? AND status = 'ACTIVE'`,
    )
    .run(deviceId);
}

export function listTrustedDevices(): Array<{
  deviceId: string;
  name: string | null;
  platform: string | null;
  pairedAt: string;
  lastSeen: string | null;
  permissions: string;
  status: TrustedDeviceStatus;
  identityStatus: "legacy" | "crypto_enrolled";
  hasPublicKey: boolean;
}> {
  return (
    db
      .prepare(
        `SELECT device_id AS deviceId, name, platform,
                paired_at AS pairedAt, last_seen AS lastSeen,
                permissions, status,
                identity_status AS identityStatus,
                CASE WHEN public_key IS NOT NULL THEN 1 ELSE 0 END AS hasPublicKey
         FROM trusted_devices ORDER BY paired_at DESC`,
      )
      .all() as Array<{
      deviceId: string;
      name: string | null;
      platform: string | null;
      pairedAt: string;
      lastSeen: string | null;
      permissions: string;
      status: TrustedDeviceStatus;
      identityStatus: string;
      hasPublicKey: number;
    }>
  ).map((d) => ({
    deviceId: d.deviceId,
    name: d.name,
    platform: d.platform,
    pairedAt: d.pairedAt,
    lastSeen: d.lastSeen,
    permissions: d.permissions,
    status: d.status,
    identityStatus:
      d.identityStatus === "crypto_enrolled" ? "crypto_enrolled" : "legacy",
    hasPublicKey: d.hasPublicKey === 1,
  }));
}

export function buildPairingUri(input: {
  agentId: string;
  endpoint: string;
  pairingSessionId: string;
  pairingSecret: string;
}): string {
  const q = new URLSearchParams({
    v: "1",
    agent: input.agentId,
    endpoint: input.endpoint,
    session: input.pairingSessionId,
    secret: input.pairingSecret,
  });
  return `personalagent://pair?${q.toString()}`;
}

/** Test helper ? hash only. */
export function hashPairingSecretForTests(secret: string): string {
  return sha256Hex(secret);
}
