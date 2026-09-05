/**
 * Auth HTTP reutilizable (install Bearer o device credential).
 * No introduce tokens nuevos. Misma semántica que WS authKind.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { verifyDeviceCredential } from "../pairing/store.ts";
import {
  BROWSER_AUTH_COOKIE,
  verifyBrowserCookieSession,
} from "./browser-session.ts";

export type HttpAuthPrincipal =
  | { kind: "install" }
  | { kind: "device"; deviceId: string };

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
 * 1) Bearer === hubToken → install
 * 2) Bearer + X-Device-Id + verifyDeviceCredential → device
 */
export function authenticateHttpRequest(
  c: Context,
  hubToken: string,
): HttpAuthPrincipal | null {
  const token = bearerToken(c.req.header("Authorization"));
  if (token) {
    if (tokenMatches(token, hubToken)) {
      return { kind: "install" };
    }
    const deviceId = c.req.header("X-Device-Id")?.trim();
    if (deviceId && verifyDeviceCredential(deviceId, token)) {
      return { kind: "device", deviceId };
    }
  }
  const browserSession = verifyBrowserCookieSession(
    cookieToken(c.req.header("Cookie"), BROWSER_AUTH_COOKIE),
  );
  if (browserSession) {
    return { kind: "install" };
  }
  return null;
}

/** PHASE 58: install o trusted device ACTIVE puede leer artifacts. */
export function authorizeArtifactRead(_principal: HttpAuthPrincipal): boolean {
  return true;
}
