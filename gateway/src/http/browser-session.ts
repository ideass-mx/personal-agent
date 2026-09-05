import { randomUUID } from "node:crypto";

export const BROWSER_AUTH_COOKIE = "pa_browser_auth";

type PendingLaunch = {
  id: string;
  deviceId: string;
  deviceName: string;
  expiresAtMs: number;
};

type BrowserCookieSession = {
  token: string;
  deviceId: string;
  deviceName: string;
  expiresAtMs: number;
};

const pendingLaunches = new Map<string, PendingLaunch>();
const browserSessions = new Map<string, BrowserCookieSession>();

const LAUNCH_TTL_MS = 60_000;
const COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

function cleanup(now = Date.now()): void {
  for (const [id, row] of pendingLaunches) {
    if (row.expiresAtMs <= now) pendingLaunches.delete(id);
  }
  for (const [token, row] of browserSessions) {
    if (row.expiresAtMs <= now) browserSessions.delete(token);
  }
}

export function createBrowserLaunchSession(input?: {
  deviceId?: string;
  deviceName?: string;
}): {
  activationId: string;
  deviceId: string;
  deviceName: string;
  expiresAt: string;
} {
  cleanup();
  const activationId = randomUUID();
  const deviceId = input?.deviceId?.trim() || `browser_${randomUUID()}`;
  const deviceName = input?.deviceName?.trim() || "Navegador";
  const expiresAtMs = Date.now() + LAUNCH_TTL_MS;
  pendingLaunches.set(activationId, {
    id: activationId,
    deviceId,
    deviceName,
    expiresAtMs,
  });
  return {
    activationId,
    deviceId,
    deviceName,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function consumeBrowserLaunchSession(activationId: string): {
  cookieToken: string;
  deviceId: string;
  deviceName: string;
  expiresAt: string;
} | null {
  cleanup();
  const pending = pendingLaunches.get(activationId);
  if (!pending) return null;
  pendingLaunches.delete(activationId);
  const cookieToken = randomUUID();
  const expiresAtMs = Date.now() + COOKIE_TTL_MS;
  browserSessions.set(cookieToken, {
    token: cookieToken,
    deviceId: pending.deviceId,
    deviceName: pending.deviceName,
    expiresAtMs,
  });
  return {
    cookieToken,
    deviceId: pending.deviceId,
    deviceName: pending.deviceName,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function verifyBrowserCookieSession(
  cookieToken: string | undefined,
): { deviceId: string; deviceName: string } | null {
  cleanup();
  if (!cookieToken) return null;
  const row = browserSessions.get(cookieToken);
  if (!row) return null;
  return {
    deviceId: row.deviceId,
    deviceName: row.deviceName,
  };
}

export function browserSessionSetCookie(
  cookieToken: string,
  expiresAt: string,
): string {
  const expires = new Date(expiresAt).toUTCString();
  return [
    `${BROWSER_AUTH_COOKIE}=${encodeURIComponent(cookieToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    expires ? `Expires=${expires}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function browserBootstrapHtml(input: {
  deviceId: string;
  deviceName: string;
}): string {
  const sessionPayload = JSON.stringify({
    httpBase: "",
    token: "",
    deviceId: input.deviceId,
    deviceName: input.deviceName,
  });
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" />
  <title>Personal Agent</title>
</head>
<body>
  <p>Abriendo Personal Agent…</p>
  <script>
    sessionStorage.setItem("pa_console_session_v1", ${JSON.stringify(sessionPayload)});
    sessionStorage.setItem("pa_host_bootstrap", "1");
    location.replace("/");
  </script>
</body>
</html>`;
}

