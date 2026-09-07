/**
 * PHASE 57.8 — Challenge-response Device authentication (Gateway).
 */
import { randomBytes } from "node:crypto";
import { db } from "../db/database.ts";
import {
  buildDeviceAuthMessage,
  verifyEd25519,
} from "../../../packages/device-crypto/index.ts";
import {
  getTrustedDeviceCrypto,
} from "./device-crypto-store.ts";
import { resolveDeviceAuthSession } from "./auth-session-resolve.ts";
import type { AuthSession } from "./auth-session-types.ts";
import type { UserContext } from "./types.ts";
import { ensureLocalIdentity } from "./ensure-local.ts";

export const DEVICE_AUTH_CHALLENGE_TTL_MS = 60_000;
export const DEVICE_AUTH_CHALLENGE_BYTES = 32;

export type DeviceAuthFailureReason =
  | "unknown_device"
  | "revoked"
  | "legacy_no_public_key"
  | "challenge_not_found"
  | "challenge_expired"
  | "challenge_consumed"
  | "challenge_device_mismatch"
  | "invalid_signature"
  | "owner_mismatch"
  | "bad_request";

function expireChallenges(nowIso = new Date().toISOString()): void {
  db.prepare(
    `UPDATE device_auth_challenges
     SET consumed_at = COALESCE(consumed_at, ?)
     WHERE consumed_at IS NULL AND expires_at < ?`,
  ).run(nowIso, nowIso);
}

export function issueDeviceAuthChallenge(deviceId: string):
  | {
      ok: true;
      deviceId: string;
      challengeId: string;
      challenge: string;
      expiresAt: string;
    }
  | { ok: false; reason: DeviceAuthFailureReason; message: string } {
  expireChallenges();
  const device = getTrustedDeviceCrypto(deviceId);
  if (!device) {
    return {
      ok: false,
      reason: "unknown_device",
      message: "Dispositivo desconocido.",
    };
  }
  if (device.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "revoked",
      message: "Dispositivo revocado.",
    };
  }
  if (!device.publicKey || device.identityStatus !== "crypto_enrolled") {
    return {
      ok: false,
      reason: "legacy_no_public_key",
      message:
        "Este dispositivo requiere enrolamiento criptográfico (publicKey).",
    };
  }

  const challengeId = `ch_${randomBytes(16).toString("hex")}`;
  const challenge = randomBytes(DEVICE_AUTH_CHALLENGE_BYTES).toString("hex");
  const expiresAt = new Date(
    Date.now() + DEVICE_AUTH_CHALLENGE_TTL_MS,
  ).toISOString();

  db.prepare(
    `INSERT INTO device_auth_challenges
       (id, device_id, challenge_hex, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(challengeId, deviceId, challenge, expiresAt);

  return {
    ok: true,
    deviceId,
    challengeId,
    challenge,
    expiresAt,
  };
}

export function verifyDeviceAuthSignature(input: {
  deviceId: string;
  challengeId: string;
  signatureBase64: string;
}):
  | {
      ok: true;
      session: AuthSession;
      userContext: UserContext;
    }
  | {
      ok: false;
      reason: DeviceAuthFailureReason;
      message: string;
      replay?: boolean;
    } {
  expireChallenges();

  if (
    !input.deviceId ||
    !input.challengeId ||
    !input.signatureBase64?.trim()
  ) {
    return {
      ok: false,
      reason: "bad_request",
      message: "Parámetros de autenticación incompletos.",
    };
  }

  const device = getTrustedDeviceCrypto(input.deviceId);
  if (!device) {
    return {
      ok: false,
      reason: "unknown_device",
      message: "Dispositivo desconocido.",
    };
  }
  if (device.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "revoked",
      message: "Dispositivo revocado.",
    };
  }
  if (!device.publicKey) {
    return {
      ok: false,
      reason: "legacy_no_public_key",
      message: "Sin identidad criptográfica enrolada.",
    };
  }

  const { user, agent } = ensureLocalIdentity();
  if (
    (device.userId && device.userId !== user.id) ||
    (device.agentId && device.agentId !== agent.id)
  ) {
    return {
      ok: false,
      reason: "owner_mismatch",
      message: "El dispositivo no pertenece a este Personal Agent.",
    };
  }

  const row = db
    .prepare(
      `SELECT id, device_id AS deviceId, challenge_hex AS challengeHex,
              expires_at AS expiresAt, consumed_at AS consumedAt
       FROM device_auth_challenges WHERE id = ?`,
    )
    .get(input.challengeId) as
    | {
        id: string;
        deviceId: string;
        challengeHex: string;
        expiresAt: string;
        consumedAt: string | null;
      }
    | undefined;

  if (!row) {
    return {
      ok: false,
      reason: "challenge_not_found",
      message: "Challenge desconocido.",
      replay: true,
    };
  }
  if (row.deviceId !== input.deviceId) {
    return {
      ok: false,
      reason: "challenge_device_mismatch",
      message: "Challenge no corresponde al dispositivo.",
      replay: true,
    };
  }
  // Expiry before consumed: expireChallenges() may have stamped consumed_at on TTL.
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    db.prepare(
      `UPDATE device_auth_challenges SET consumed_at = datetime('now')
       WHERE id = ?`,
    ).run(row.id);
    return {
      ok: false,
      reason: "challenge_expired",
      message: "Challenge expirado.",
      replay: true,
    };
  }
  if (row.consumedAt) {
    return {
      ok: false,
      reason: "challenge_consumed",
      message: "Challenge ya utilizado.",
      replay: true,
    };
  }

  const payload = buildDeviceAuthMessage({
    deviceId: input.deviceId,
    challengeHex: row.challengeHex,
  });
  const valid = verifyEd25519({
    publicKeySpkiBase64: device.publicKey,
    payload,
    signatureBase64: input.signatureBase64.trim(),
  });

  // Consume challenge regardless of signature result to prevent online guessing
  // reuse of the same challenge id after a failed attempt with captured traffic.
  const consumed = db
    .prepare(
      `UPDATE device_auth_challenges
       SET consumed_at = datetime('now')
       WHERE id = ? AND consumed_at IS NULL`,
    )
    .run(row.id);
  if (consumed.changes !== 1) {
    return {
      ok: false,
      reason: "challenge_consumed",
      message: "Challenge ya utilizado.",
      replay: true,
    };
  }

  if (!valid) {
    return {
      ok: false,
      reason: "invalid_signature",
      message: "Firma inválida.",
    };
  }

  const { session, userContext } = resolveDeviceAuthSession({
    deviceId: input.deviceId,
  });
  return { ok: true, session, userContext };
}
