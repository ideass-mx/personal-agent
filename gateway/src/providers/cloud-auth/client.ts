/**
 * Cloud Auth client — device challenge → Ed25519 sign → short-lived session.
 */
import {
  buildCloudAuthMessage,
  CLOUD_AUTH_AUDIENCE,
} from "../../../../packages/device-crypto/index.ts";
import type { DeviceKeyStore } from "../../../../packages/device-crypto/index.ts";
import { ensureLocalIdentity } from "../../identity/ensure-local.ts";
import { ensureHostTrustedDevice } from "../../identity/ensure-host-device.ts";
import { redactForLog } from "../../credentials/credential-redactor.ts";
import {
  CloudAuthError,
  type CloudAuthErrorCode,
  type CloudAuthLifecycle,
  type CloudAuthTransport,
  type CloudSession,
  type CloudSessionPublicStatus,
  userMessageForCloudAuth,
} from "./types.ts";
import type { CloudSessionStore } from "./session-store.ts";
import { openHostDeviceKeyStore, shortDeviceId } from "./host-identity.ts";

const EXPIRY_SKEW_MS = 30_000;

export type CloudAuthClient = {
  getLifecycle(): CloudAuthLifecycle;
  getPublicStatus(): Promise<CloudSessionPublicStatus>;
  /** Ensure valid access token (authenticate or refresh as needed). */
  ensureAccessToken(signal?: AbortSignal): Promise<string>;
  /** Force full device handshake. */
  authenticate(signal?: AbortSignal): Promise<CloudSessionPublicStatus>;
  refresh(signal?: AbortSignal): Promise<string>;
  disconnect(signal?: AbortSignal): Promise<void>;
  /** Dev/test static token path — never production default. */
  isUsingDevToken(): boolean;
};

export type CreateCloudAuthClientInput = {
  transport: CloudAuthTransport | null;
  sessionStore: CloudSessionStore;
  /** Injected for tests. */
  deviceKeyStore?: DeviceKeyStore;
  deviceId?: string;
  /** DEV/TEST ONLY — PERSONAL_AGENT_CLOUD_SESSION_TOKEN when PERSONAL_AGENT_CLOUD_DEV_AUTH=1 */
  devSessionToken?: string | null;
  log?: (event: string, meta?: Record<string, unknown>) => void;
};

function isExpired(session: CloudSession, now = Date.now()): boolean {
  const exp = Date.parse(session.expiresAt);
  if (!Number.isFinite(exp)) return true;
  return now >= exp - EXPIRY_SKEW_MS;
}

export function createCloudAuthClient(
  input: CreateCloudAuthClientInput,
): CloudAuthClient {
  let lifecycle: CloudAuthLifecycle = "NO_SESSION";
  let lastError: CloudAuthErrorCode | null = null;
  let authAbort: AbortController | null = null;
  const usingDev =
    Boolean(input.devSessionToken?.trim()) &&
    process.env.PERSONAL_AGENT_CLOUD_DEV_AUTH === "1";

  const log = (event: string, meta?: Record<string, unknown>) => {
    input.log?.(event, meta);
    const safe = redactForLog(meta ?? {});
    process.stderr.write(`[gateway] ${event} ${safe}\n`);
  };

  async function resolveDevice(): Promise<{
    deviceId: string;
    store: DeviceKeyStore;
  }> {
    if (input.deviceKeyStore && input.deviceId) {
      return { deviceId: input.deviceId, store: input.deviceKeyStore };
    }
    return openHostDeviceKeyStore({
      deviceId: input.deviceId,
      forceMemory: process.env.PA_DEVICE_KEYSTORE_MEMORY === "1",
    });
  }

  async function loadSession(): Promise<CloudSession | null> {
    return input.sessionStore.load();
  }

  async function saveSession(session: CloudSession): Promise<void> {
    await input.sessionStore.save(session);
    lifecycle = "AUTHENTICATED";
    lastError = null;
  }

  const api: CloudAuthClient = {
    getLifecycle() {
      return lifecycle;
    },
    isUsingDevToken() {
      return usingDev;
    },
    async getPublicStatus() {
      if (usingDev) {
        return {
          lifecycle: "AUTHENTICATED",
          connected: true,
          deviceLabel: "Este equipo (dev)",
          sessionActive: true,
          expiresAt: null,
          errorCode: null,
          usingDevToken: true,
        };
      }
      const session = await loadSession();
      const active =
        !!session &&
        session.status === "ACTIVE" &&
        !isExpired(session) &&
        lifecycle !== "DEVICE_REVOKED" &&
        lifecycle !== "SESSION_REVOKED";
      return {
        lifecycle: active ? "AUTHENTICATED" : lifecycle,
        connected: active,
        deviceLabel: "Este equipo",
        sessionActive: active,
        expiresAt: session?.expiresAt ?? null,
        errorCode: lastError,
        usingDevToken: false,
      };
    },
    async authenticate(signal) {
      if (usingDev) {
        lifecycle = "AUTHENTICATED";
        return api.getPublicStatus();
      }
      if (!input.transport) {
        lastError = "CLOUD_AUTH_UNAVAILABLE";
        lifecycle = "CLOUD_UNAVAILABLE";
        throw new CloudAuthError(
          "CLOUD_AUTH_UNAVAILABLE",
          "cloud transport missing",
        );
      }
      authAbort?.abort();
      authAbort = new AbortController();
      const linked = authAbort.signal;
      if (signal) {
        if (signal.aborted) authAbort.abort();
        else {
          signal.addEventListener("abort", () => authAbort?.abort(), {
            once: true,
          });
        }
      }

      lifecycle = "AUTHENTICATING";
      log("cloud_auth_started", {});
      try {
        const { deviceId, store } = await resolveDevice();
        let pub = await store.getPublicKey();
        if (!pub) pub = await store.generate();

        // Register public identity locally (Gateway trusted device) — not Cloud secrets.
        try {
          ensureHostTrustedDevice({
            deviceId,
            publicKey: pub.publicKey,
            deviceName: "Este equipo",
          });
        } catch {
          /* local registry optional for cloud-only path */
        }

        const identity = ensureLocalIdentity();
        const challenge = await input.transport.requestChallenge({
          deviceId,
          signal: linked,
        });
        log("cloud_auth_challenge_received", {
          diagnosticId: challenge.challengeId.slice(0, 12),
          deviceId: shortDeviceId(deviceId),
          userId: identity.user.id,
        });

        if (Date.parse(challenge.expiresAt) <= Date.now()) {
          throw new CloudAuthError(
            "CLOUD_AUTH_CHALLENGE_FAILED",
            "challenge already expired",
          );
        }

        const timestamp = new Date().toISOString();
        const message = buildCloudAuthMessage({
          deviceId,
          challengeHex: challenge.challenge,
          timestampIso: timestamp,
          audience: CLOUD_AUTH_AUDIENCE,
        });
        const signature = await store.sign(message);

        const session = await input.transport.verify({
          body: {
            deviceId,
            challengeId: challenge.challengeId,
            signature,
            timestamp,
            algorithm: "Ed25519",
            audience: CLOUD_AUTH_AUDIENCE,
            publicKey: pub.publicKey,
          },
          signal: linked,
        });

        log("cloud_auth_verified", {
          deviceId: shortDeviceId(deviceId),
          userId: session.userId,
        });
        await saveSession(session);
        log("cloud_session_created", {
          deviceId: shortDeviceId(deviceId),
          userId: session.userId,
          diagnosticId: session.sessionId.slice(0, 12),
        });
        return api.getPublicStatus();
      } catch (err) {
        if (err instanceof CloudAuthError) {
          lastError = err.code;
          if (err.code === "CLOUD_AUTH_DEVICE_REVOKED") {
            lifecycle = "DEVICE_REVOKED";
          } else if (err.code === "CLOUD_AUTH_UNAVAILABLE") {
            lifecycle = "CLOUD_UNAVAILABLE";
          } else {
            lifecycle = "AUTHENTICATION_FAILED";
          }
          log("cloud_auth_failed", {
            errorCode: err.code,
            message: userMessageForCloudAuth(err.code),
          });
          throw err;
        }
        lastError = "CLOUD_AUTH_UNKNOWN_ERROR";
        lifecycle = "AUTHENTICATION_FAILED";
        log("cloud_auth_failed", { errorCode: lastError });
        throw new CloudAuthError(
          "CLOUD_AUTH_UNKNOWN_ERROR",
          err instanceof Error ? err.message : "auth failed",
        );
      }
    },
    async refresh(signal) {
      if (usingDev) return input.devSessionToken!.trim();
      if (!input.transport) {
        throw new CloudAuthError(
          "CLOUD_AUTH_UNAVAILABLE",
          "cloud transport missing",
        );
      }
      const session = await loadSession();
      if (!session?.refreshToken) {
        log("cloud_session_expired", {});
        lifecycle = "SESSION_EXPIRED";
        lastError = "CLOUD_AUTH_SESSION_EXPIRED";
        throw new CloudAuthError(
          "CLOUD_AUTH_SESSION_EXPIRED",
          "no refresh token",
        );
      }
      lifecycle = "REFRESHING";
      log("cloud_session_refresh_started", {
        deviceId: shortDeviceId(session.deviceId),
        userId: session.userId,
      });
      try {
        const next = await input.transport.refresh({
          refreshToken: session.refreshToken,
          deviceId: session.deviceId,
          signal,
        });
        await saveSession(next);
        log("cloud_session_refresh_completed", {
          deviceId: shortDeviceId(next.deviceId),
          userId: next.userId,
        });
        return next.accessToken;
      } catch (err) {
        if (err instanceof CloudAuthError) {
          lastError = err.code;
          if (err.code === "CLOUD_AUTH_DEVICE_REVOKED") {
            lifecycle = "DEVICE_REVOKED";
            log("cloud_device_revoked", { errorCode: err.code });
            await input.sessionStore.clear();
          } else if (err.code === "CLOUD_AUTH_SESSION_REVOKED") {
            lifecycle = "SESSION_REVOKED";
            log("cloud_session_revoked", { errorCode: err.code });
            await input.sessionStore.clear();
          } else {
            lifecycle = "SESSION_EXPIRED";
            log("cloud_session_expired", { errorCode: err.code });
          }
          throw err;
        }
        throw err;
      }
    },
    async ensureAccessToken(signal) {
      if (usingDev) return input.devSessionToken!.trim();
      const session = await loadSession();
      if (session && session.status === "ACTIVE" && !isExpired(session)) {
        lifecycle = "AUTHENTICATED";
        return session.accessToken;
      }
      if (session?.refreshToken) {
        try {
          return await api.refresh(signal);
        } catch {
          /* fall through to full auth */
        }
      }
      await api.authenticate(signal);
      const again = await loadSession();
      if (!again?.accessToken) {
        throw new CloudAuthError("CLOUD_AUTH_REQUIRED", "no session");
      }
      return again.accessToken;
    },
    async disconnect(signal) {
      if (usingDev) {
        lifecycle = "NO_SESSION";
        return;
      }
      const session = await loadSession();
      if (session?.accessToken && input.transport) {
        try {
          await input.transport.revoke({
            accessToken: session.accessToken,
            signal,
          });
        } catch {
          /* local clear still required */
        }
      }
      await input.sessionStore.clear();
      lifecycle = "NO_SESSION";
      lastError = null;
      authAbort?.abort();
      authAbort = null;
    },
  };

  return api;
}
