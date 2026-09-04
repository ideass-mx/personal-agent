/**
 * Auth HTTP reutilizable (install Bearer o device credential).
 * No introduce tokens nuevos. Misma semántica que WS authKind.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { verifyDeviceCredential } from "../pairing/store.ts";

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
  if (!token) return null;
  if (tokenMatches(token, hubToken)) {
    return { kind: "install" };
  }
  const deviceId = c.req.header("X-Device-Id")?.trim();
  if (deviceId && verifyDeviceCredential(deviceId, token)) {
    return { kind: "device", deviceId };
  }
  return null;
}

/** PHASE 58: install o trusted device ACTIVE puede leer artifacts. */
export function authorizeArtifactRead(_principal: HttpAuthPrincipal): boolean {
  return true;
}
