import { randomUUID } from "node:crypto";
import {
  browserSessionExpiresAt,
  issueBrowserAuthSession,
  resolveBrowserAuthSession,
} from "../identity/auth-session-resolve.ts";
import { isSessionActive } from "../identity/auth-session-store.ts";

export const BROWSER_AUTH_COOKIE = "pa_browser_auth";

type PendingLaunch = {
  id: string;
  deviceId: string;
  deviceName: string;
  expiresAtMs: number;
};

const pendingLaunches = new Map<string, PendingLaunch>();

const LAUNCH_TTL_MS = 60_000;

function cleanupPending(now = Date.now()): void {
  for (const [id, row] of pendingLaunches) {
    if (row.expiresAtMs <= now) pendingLaunches.delete(id);
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
  cleanupPending();
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
  authSessionId: string;
} | null {
  cleanupPending();
  const pending = pendingLaunches.get(activationId);
  if (!pending) return null;
  pendingLaunches.delete(activationId);
  const cookieToken = randomUUID();
  const expiresAt = browserSessionExpiresAt();
  const session = issueBrowserAuthSession({
    deviceId: pending.deviceId,
    deviceName: pending.deviceName,
    cookieToken,
    expiresAt,
  });
  return {
    cookieToken,
    deviceId: pending.deviceId,
    deviceName: pending.deviceName,
    expiresAt,
    authSessionId: session.id,
  };
}

/**
 * Cookie proof → browser AuthSession (ACTIVE only).
 * Returns device metadata for WS auto-auth; session id is product Session.
 */
export function verifyBrowserCookieSession(
  cookieToken: string | undefined,
): {
  deviceId: string;
  deviceName: string;
  authSessionId: string;
} | null {
  const resolved = resolveBrowserAuthSession(cookieToken);
  if (!resolved) return null;
  if (!isSessionActive(resolved.session.id)) return null;
  return {
    deviceId: resolved.session.deviceId || resolved.deviceName,
    deviceName: resolved.deviceName,
    authSessionId: resolved.session.id,
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
    var payload = ${JSON.stringify(sessionPayload)};
    try { localStorage.setItem("pa_console_session_v1", payload); } catch (e) {}
    try { sessionStorage.setItem("pa_console_session_v1", payload); } catch (e) {}
    try { localStorage.setItem("pa_host_bootstrap", "1"); } catch (e) {}
    try { sessionStorage.setItem("pa_host_bootstrap", "1"); } catch (e) {}
    location.replace("/");
  </script>
</body>
</html>`;
}
