/**
 * HTTP transport for Personal Agent Cloud Auth contract.
 * No BYOK keys. No private keys. SSRF + timeouts.
 */
import { assertUrlSafeForFetch } from "../../resources/ssrf.ts";
import { redactForLog } from "../../credentials/credential-redactor.ts";
import {
  CloudAuthError,
  type CloudAuthTransport,
  type CloudChallenge,
  type CloudSession,
  type CloudVerifyRequest,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = {
  challenge: 15_000,
  verify: 20_000,
  refresh: 20_000,
  revoke: 10_000,
} as const;

export type HttpCloudAuthTransportOptions = {
  baseUrl: string;
  /** Allow http:// only when PERSONAL_AGENT_CLOUD_ALLOW_INSECURE=1 (dev). */
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
  timeouts?: Partial<typeof DEFAULT_TIMEOUT_MS>;
};

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          ctrl.abort();
        },
        { once: true },
      );
    }
  }
  ctrl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return ctrl.signal;
}

function mapHttpAuthError(status: number, body: string): CloudAuthError {
  const lower = body.toLowerCase();
  if (status === 401) {
    if (lower.includes("device_revoked") || lower.includes("device revoked")) {
      return new CloudAuthError(
        "CLOUD_AUTH_DEVICE_REVOKED",
        "device revoked",
      );
    }
    if (lower.includes("revoked")) {
      return new CloudAuthError(
        "CLOUD_AUTH_SESSION_REVOKED",
        "session revoked",
      );
    }
    return new CloudAuthError("CLOUD_AUTH_SESSION_EXPIRED", "session expired");
  }
  if (status === 403) {
    if (lower.includes("device")) {
      return new CloudAuthError(
        "CLOUD_AUTH_DEVICE_REVOKED",
        "device revoked",
      );
    }
    return new CloudAuthError("CLOUD_AUTH_FORBIDDEN", "forbidden");
  }
  if (status === 429 || status >= 500) {
    return new CloudAuthError("CLOUD_AUTH_UNAVAILABLE", `http_${status}`);
  }
  if (status === 400 && lower.includes("signature")) {
    return new CloudAuthError(
      "CLOUD_AUTH_SIGNATURE_INVALID",
      "signature invalid",
    );
  }
  if (status === 400 && lower.includes("challenge")) {
    return new CloudAuthError(
      "CLOUD_AUTH_CHALLENGE_FAILED",
      "challenge failed",
    );
  }
  return new CloudAuthError("CLOUD_AUTH_UNKNOWN_ERROR", `http_${status}`);
}

async function assertCloudBaseUrl(
  baseUrl: string,
  allowInsecureHttp: boolean,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CloudAuthError("CLOUD_AUTH_UNAVAILABLE", "invalid cloud base url");
  }
  const isProd = process.env.NODE_ENV === "production";
  if (url.protocol === "http:") {
    if (isProd || !allowInsecureHttp) {
      throw new CloudAuthError(
        "CLOUD_AUTH_UNAVAILABLE",
        "https required for cloud",
      );
    }
  } else if (url.protocol !== "https:") {
    throw new CloudAuthError("CLOUD_AUTH_UNAVAILABLE", "unsupported scheme");
  }
  const safe = await assertUrlSafeForFetch(url.toString());
  if (!safe.ok) {
    throw new CloudAuthError(
      "CLOUD_AUTH_UNAVAILABLE",
      `url unsafe: ${safe.reason}`,
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export async function createHttpCloudAuthTransport(
  opts: HttpCloudAuthTransportOptions,
): Promise<CloudAuthTransport> {
  const allowInsecure =
    opts.allowInsecureHttp === true ||
    process.env.PERSONAL_AGENT_CLOUD_ALLOW_INSECURE === "1";
  const base = await assertCloudBaseUrl(opts.baseUrl, allowInsecure);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeouts = { ...DEFAULT_TIMEOUT_MS, ...(opts.timeouts ?? {}) };

  async function jsonRequest<T>(input: {
    path: string;
    method: string;
    body?: unknown;
    accessToken?: string;
    signal?: AbortSignal;
    timeoutMs: number;
  }): Promise<T> {
    const signal = withTimeout(input.signal, input.timeoutMs);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (input.accessToken) {
      headers.Authorization = `Bearer ${input.accessToken}`;
    }
    let res: Response;
    try {
      res = await fetchImpl(`${base}${input.path}`, {
        method: input.method,
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void redactForLog(msg);
      throw new CloudAuthError("CLOUD_AUTH_UNAVAILABLE", "network");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw mapHttpAuthError(res.status, text);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    async requestChallenge({ deviceId, signal }) {
      const data = await jsonRequest<CloudChallenge>({
        path: "/v1/auth/device/challenge",
        method: "POST",
        body: { deviceId },
        signal,
        timeoutMs: timeouts.challenge,
      });
      if (!data?.challengeId || !data.challenge || !data.expiresAt) {
        throw new CloudAuthError(
          "CLOUD_AUTH_CHALLENGE_FAILED",
          "malformed challenge",
        );
      }
      return data;
    },
    async verify({ body, signal }) {
      const data = await jsonRequest<CloudSession>({
        path: "/v1/auth/device/verify",
        method: "POST",
        body,
        signal,
        timeoutMs: timeouts.verify,
      });
      if (!data?.accessToken || !data.sessionId || !data.expiresAt) {
        throw new CloudAuthError(
          "CLOUD_AUTH_UNKNOWN_ERROR",
          "malformed session",
        );
      }
      return { ...data, status: data.status || "ACTIVE" };
    },
    async refresh({ refreshToken, deviceId, signal }) {
      const data = await jsonRequest<CloudSession>({
        path: "/v1/auth/session/refresh",
        method: "POST",
        body: { refreshToken, deviceId },
        signal,
        timeoutMs: timeouts.refresh,
      });
      if (!data?.accessToken || !data.sessionId) {
        throw new CloudAuthError(
          "CLOUD_AUTH_SESSION_EXPIRED",
          "refresh failed",
        );
      }
      return { ...data, status: data.status || "ACTIVE" };
    },
    async revoke({ accessToken, signal }) {
      try {
        await jsonRequest<void>({
          path: "/v1/auth/session/revoke",
          method: "POST",
          body: {},
          accessToken,
          signal,
          timeoutMs: timeouts.revoke,
        });
      } catch (err) {
        if (err instanceof CloudAuthError && err.code === "CLOUD_AUTH_UNAVAILABLE") {
          throw err;
        }
        // Best-effort local disconnect even if remote already gone.
      }
    },
  };
}
