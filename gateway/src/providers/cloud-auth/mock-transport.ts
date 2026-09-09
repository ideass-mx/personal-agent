/**
 * In-process Cloud Auth transport for tests (contract simulator — not a product server).
 * Implements challenge single-use, expiry, audience, Ed25519 verify, session refresh/revoke.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  buildCloudAuthMessage,
  CLOUD_AUTH_AUDIENCE,
  verifyEd25519,
} from "../../../../packages/device-crypto/index.ts";
import {
  CloudAuthError,
  type CloudAuthTransport,
  type CloudChallenge,
  type CloudSession,
  type CloudVerifyRequest,
} from "./types.ts";

type ChallengeRow = {
  challengeId: string;
  challenge: string;
  deviceId: string;
  expiresAtMs: number;
  used: boolean;
};

type SessionRow = CloudSession & { revoked: boolean };

const CLOCK_SKEW_MS = 120_000;

export type MockCloudAuthOptions = {
  /** Known device public keys (SPKI base64). */
  devicePublicKeys: Map<string, string>;
  /** Devices marked revoked. */
  revokedDevices?: Set<string>;
  challengeTtlMs?: number;
  sessionTtlMs?: number;
  userIdForDevice?: (deviceId: string) => string;
};

export function createMockCloudAuthTransport(
  opts: MockCloudAuthOptions,
): CloudAuthTransport & {
  inspectSessions(): SessionRow[];
  markDeviceRevoked(deviceId: string): void;
} {
  const challenges = new Map<string, ChallengeRow>();
  const sessions = new Map<string, SessionRow>();
  const revoked = opts.revokedDevices ?? new Set<string>();
  const challengeTtlMs = opts.challengeTtlMs ?? 60_000;
  const sessionTtlMs = opts.sessionTtlMs ?? 5 * 60_000;
  const userIdFor =
    opts.userIdForDevice ??
    ((deviceId: string) =>
      `user_${createHash("sha256").update(deviceId).digest("hex").slice(0, 16)}`);

  function issueSession(deviceId: string): CloudSession {
    const now = Date.now();
    const session: SessionRow = {
      sessionId: `sess_${randomUUID()}`,
      accessToken: `at_${randomBytes(24).toString("hex")}`,
      refreshToken: `rt_${randomBytes(24).toString("hex")}`,
      deviceId,
      userId: userIdFor(deviceId),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + sessionTtlMs).toISOString(),
      scopes: ["llm:invoke"],
      status: "ACTIVE",
      revoked: false,
    };
    sessions.set(session.sessionId, session);
    sessions.set(session.accessToken, session);
    if (session.refreshToken) sessions.set(session.refreshToken, session);
    return { ...session };
  }

  return {
    inspectSessions() {
      const seen = new Set<string>();
      const out: SessionRow[] = [];
      for (const s of sessions.values()) {
        if (seen.has(s.sessionId)) continue;
        seen.add(s.sessionId);
        out.push(s);
      }
      return out;
    },
    markDeviceRevoked(deviceId: string) {
      revoked.add(deviceId);
      for (const s of sessions.values()) {
        if (s.deviceId === deviceId) {
          s.revoked = true;
          s.status = "REVOKED";
        }
      }
    },
    async requestChallenge({ deviceId }) {
      if (revoked.has(deviceId)) {
        throw new CloudAuthError("CLOUD_AUTH_DEVICE_REVOKED", "device revoked");
      }
      if (!opts.devicePublicKeys.has(deviceId)) {
        throw new CloudAuthError("CLOUD_AUTH_FORBIDDEN", "unknown device");
      }
      const challengeId = `ch_${randomUUID()}`;
      const challenge = randomBytes(32).toString("hex");
      const expiresAtMs = Date.now() + challengeTtlMs;
      const row: ChallengeRow = {
        challengeId,
        challenge,
        deviceId,
        expiresAtMs,
        used: false,
      };
      challenges.set(challengeId, row);
      return {
        challengeId,
        challenge,
        expiresAt: new Date(expiresAtMs).toISOString(),
      } satisfies CloudChallenge;
    },
    async verify({ body }: { body: CloudVerifyRequest }) {
      if (revoked.has(body.deviceId)) {
        throw new CloudAuthError("CLOUD_AUTH_DEVICE_REVOKED", "device revoked");
      }
      if (body.audience !== CLOUD_AUTH_AUDIENCE) {
        throw new CloudAuthError("CLOUD_AUTH_FORBIDDEN", "wrong audience");
      }
      if (body.algorithm !== "Ed25519") {
        throw new CloudAuthError(
          "CLOUD_AUTH_SIGNATURE_INVALID",
          "bad algorithm",
        );
      }
      const row = challenges.get(body.challengeId);
      if (!row || row.deviceId !== body.deviceId) {
        throw new CloudAuthError(
          "CLOUD_AUTH_CHALLENGE_FAILED",
          "unknown challenge",
        );
      }
      if (row.used) {
        throw new CloudAuthError(
          "CLOUD_AUTH_CHALLENGE_FAILED",
          "challenge reused",
        );
      }
      if (Date.now() > row.expiresAtMs) {
        throw new CloudAuthError(
          "CLOUD_AUTH_CHALLENGE_FAILED",
          "challenge expired",
        );
      }
      const ts = Date.parse(body.timestamp);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > CLOCK_SKEW_MS) {
        throw new CloudAuthError(
          "CLOUD_AUTH_SIGNATURE_INVALID",
          "timestamp skew",
        );
      }
      const pub =
        body.publicKey || opts.devicePublicKeys.get(body.deviceId) || "";
      if (!pub) {
        throw new CloudAuthError("CLOUD_AUTH_FORBIDDEN", "no public key");
      }
      const message = buildCloudAuthMessage({
        deviceId: body.deviceId,
        challengeHex: row.challenge,
        timestampIso: body.timestamp,
        audience: body.audience,
      });
      const ok = verifyEd25519({
        publicKeySpkiBase64: pub,
        payload: message,
        signatureBase64: body.signature,
      });
      if (!ok) {
        throw new CloudAuthError(
          "CLOUD_AUTH_SIGNATURE_INVALID",
          "bad signature",
        );
      }
      row.used = true;
      return issueSession(body.deviceId);
    },
    async refresh({ refreshToken, deviceId }) {
      const s = sessions.get(refreshToken);
      if (!s || s.refreshToken !== refreshToken || s.deviceId !== deviceId) {
        throw new CloudAuthError(
          "CLOUD_AUTH_SESSION_EXPIRED",
          "refresh invalid",
        );
      }
      if (s.revoked || revoked.has(deviceId)) {
        throw new CloudAuthError(
          "CLOUD_AUTH_DEVICE_REVOKED",
          "device revoked",
        );
      }
      if (Date.parse(s.expiresAt) + sessionTtlMs < Date.now() && false) {
        /* refresh tokens stay valid until revoked in this mock */
      }
      s.revoked = true;
      s.status = "REVOKED";
      return issueSession(deviceId);
    },
    async revoke({ accessToken }) {
      const s = sessions.get(accessToken);
      if (s) {
        s.revoked = true;
        s.status = "REVOKED";
      }
    },
  };
}
