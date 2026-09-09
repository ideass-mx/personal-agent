/**
 * PHASE 62.1 — Cloud Auth contract types (client + documented remote API).
 * No master provider keys; no BYOK secrets.
 */

export type CloudAuthErrorCode =
  | "CLOUD_AUTH_REQUIRED"
  | "CLOUD_AUTH_CHALLENGE_FAILED"
  | "CLOUD_AUTH_SIGNATURE_INVALID"
  | "CLOUD_AUTH_SESSION_EXPIRED"
  | "CLOUD_AUTH_SESSION_REVOKED"
  | "CLOUD_AUTH_DEVICE_REVOKED"
  | "CLOUD_AUTH_FORBIDDEN"
  | "CLOUD_AUTH_UNAVAILABLE"
  | "CLOUD_AUTH_UNKNOWN_ERROR";

export type CloudAuthLifecycle =
  | "NO_SESSION"
  | "AUTHENTICATING"
  | "AUTHENTICATED"
  | "EXPIRING"
  | "REFRESHING"
  | "AUTHENTICATION_FAILED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "DEVICE_REVOKED"
  | "CLOUD_UNAVAILABLE";

export type CloudChallenge = {
  challengeId: string;
  challenge: string;
  expiresAt: string;
};

export type CloudVerifyRequest = {
  deviceId: string;
  challengeId: string;
  signature: string;
  timestamp: string;
  algorithm: "Ed25519";
  audience: "personal-agent-cloud";
  publicKey?: string;
};

export type CloudSession = {
  sessionId: string;
  accessToken: string;
  refreshToken?: string;
  deviceId: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  scopes: string[];
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
};

/** Public status for UI — never includes tokens. */
export type CloudSessionPublicStatus = {
  lifecycle: CloudAuthLifecycle;
  connected: boolean;
  deviceLabel: string;
  sessionActive: boolean;
  expiresAt: string | null;
  errorCode: CloudAuthErrorCode | null;
  /** True only when using PERSONAL_AGENT_CLOUD_SESSION_TOKEN (dev/test). */
  usingDevToken: boolean;
};

export type CloudAuthTransport = {
  requestChallenge(input: {
    deviceId: string;
    signal?: AbortSignal;
  }): Promise<CloudChallenge>;
  verify(input: {
    body: CloudVerifyRequest;
    signal?: AbortSignal;
  }): Promise<CloudSession>;
  refresh(input: {
    refreshToken: string;
    deviceId: string;
    signal?: AbortSignal;
  }): Promise<CloudSession>;
  revoke(input: {
    accessToken: string;
    signal?: AbortSignal;
  }): Promise<void>;
};

export class CloudAuthError extends Error {
  readonly code: CloudAuthErrorCode;
  constructor(code: CloudAuthErrorCode, message: string) {
    super(message);
    this.name = "CloudAuthError";
    this.code = code;
  }
}

export function userMessageForCloudAuth(code: CloudAuthErrorCode): string {
  switch (code) {
    case "CLOUD_AUTH_UNAVAILABLE":
      return "No podemos conectar con Personal Agent Cloud. Comprueba tu conexión a Internet y vuelve a intentarlo.";
    case "CLOUD_AUTH_SESSION_EXPIRED":
      return "Tu sesión de Personal Agent Cloud expiró. Estamos intentando reconectarte.";
    case "CLOUD_AUTH_DEVICE_REVOKED":
    case "CLOUD_AUTH_SESSION_REVOKED":
      return "Este dispositivo ya no tiene acceso a Personal Agent Cloud. Vuelve a autorizar este dispositivo para continuar.";
    case "CLOUD_AUTH_REQUIRED":
    case "CLOUD_AUTH_CHALLENGE_FAILED":
    case "CLOUD_AUTH_SIGNATURE_INVALID":
    case "CLOUD_AUTH_FORBIDDEN":
    case "CLOUD_AUTH_UNKNOWN_ERROR":
    default:
      return "No pudimos conectar este dispositivo con Personal Agent Cloud. Vuelve a intentarlo.";
  }
}
