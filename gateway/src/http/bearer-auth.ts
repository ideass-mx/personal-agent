/**
 * Auth HTTP reutilizable (install Bearer, device credential, browser cookie).
 * PHASE 57.3: each proof resolves to AuthSession → UserContext.
 * PHASE 57.7: HUB_TOKEN / install_compat is LOCAL-ONLY (loopback peer).
 * Remote product access requires Trusted Device or browser AuthSession.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { verifyDeviceCredential } from "../pairing/store.ts";
import {
  resolveDeviceAuthSession,
  resolveInstallCompatSession,
  resolveBrowserAuthSession,
} from "../identity/auth-session-resolve.ts";
import type { UserContext } from "../identity/types.ts";
import {
  BROWSER_AUTH_COOKIE,
  verifyBrowserCookieSession,
} from "./browser-session.ts";
import { isLoopbackRequest } from "./remote-access.ts";

export type HttpAuthPrincipal =
  | {
      kind: "install";
      authSessionId: string;
      userContext: UserContext;
    }
  | {
      kind: "device";
      deviceId: string;
      authSessionId: string;
      userContext: UserContext;
    }
  | {
      kind: "browser";
      deviceId: string;
      authSessionId: string;
      userContext: UserContext;
    };

export type AuthenticateHttpOptions = {
  /**
   * When false (default), HUB_TOKEN is rejected for non-loopback peers.
   * Migration debt: copying HUB_TOKEN to another machine must not grant trust.
   */
  allowRemoteInstallCompat?: boolean;
  /**
   * Test / override seam for peer classification (PHASE 57.7 attack-path tests).
   * When omitted, uses `isLoopbackRequest(c)`.
   */
  peerIsLoopback?: boolean;
};

export function tokenMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

export function cookieToken(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function httpErrorBody(
  code: string,
  message: string,
): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

/**
 * Autentica:
 * 1) Bearer === hubToken → install_compat (loopback only unless opted)
 * 2) Bearer + X-Device-Id + verifyDeviceCredential → device Session
 * 3) Cookie pa_browser_auth → browser Session (≠ install)
 */
export function authenticateHttpRequest(
  c: Context,
  hubToken: string,
  opts?: AuthenticateHttpOptions,
): HttpAuthPrincipal | null {
  const loopback = opts?.peerIsLoopback ?? isLoopbackRequest(c);
  const token = bearerToken(c.req.header("Authorization"));
  if (token) {
    if (tokenMatches(token, hubToken)) {
      if (!loopback && !opts?.allowRemoteInstallCompat) {
        // install_compat is not a Trusted Device credential.
        // Migration debt: Bearer HUB_TOKEN on LAN ≠ Trusted Device (PHASE 57.7).
        return null;
      }
      const deviceId = c.req.header("X-Device-Id")?.trim();
      const { session, userContext } = resolveInstallCompatSession({
        deviceId,
      });
      return {
        kind: "install",
        authSessionId: session.id,
        userContext,
      };
    }
    const deviceId = c.req.header("X-Device-Id")?.trim();
    if (deviceId && verifyDeviceCredential(deviceId, token)) {
      const { session, userContext } = resolveDeviceAuthSession({ deviceId });
      return {
        kind: "device",
        deviceId,
        authSessionId: session.id,
        userContext,
      };
    }
  }

  const cookie = cookieToken(c.req.header("Cookie"), BROWSER_AUTH_COOKIE);
  const browser = verifyBrowserCookieSession(cookie);
  if (browser) {
    const resolved = resolveBrowserAuthSession(cookie);
    if (!resolved) return null;
    return {
      kind: "browser",
      deviceId: browser.deviceId,
      authSessionId: resolved.session.id,
      userContext: resolved.userContext,
    };
  }
  return null;
}

/** PHASE 58: install, device o browser autenticado puede leer artifacts. */
export function authorizeArtifactRead(_principal: HttpAuthPrincipal): boolean {
  return true;
}
