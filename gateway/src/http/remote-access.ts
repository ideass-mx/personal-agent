/**
 * PHASE 57.7 — Remote access helpers.
 *
 * Loopback = default. Non-loopback bind = explicit opt-in (REMOTE_ACCESS_ENABLED).
 * LAN/Tailscale ≠ Trusted Device. IP ≠ identity. HUB_TOKEN = install_compat (local only).
 */
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "../config.ts";

/** Bind/host values treated as loopback-only. */
export function isLoopbackBind(bindHost: string): boolean {
  const h = bindHost.trim().toLowerCase();
  return (
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "localhost" ||
    h === "0:0:0:0:0:0:0:1"
  );
}

export function isRemoteAccessEnabled(bindHost: string): boolean {
  return !isLoopbackBind(bindHost);
}

/** Normalize IPv4-mapped IPv6 and classify peer address. */
export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  let a = addr.trim().toLowerCase();
  if (a.startsWith("::ffff:")) a = a.slice(7);
  return a === "127.0.0.1" || a === "::1" || a === "localhost";
}

/**
 * Pure peer classification (also used by tests).
 * Loopback bind ⇒ every accepted connection is local (TCP already enforces).
 */
export function isLocalPeer(opts: {
  bindHost: string;
  peerAddress?: string | null;
}): boolean {
  if (isLoopbackBind(opts.bindHost)) return true;
  return isLoopbackAddress(opts.peerAddress);
}

/**
 * Peer TCP address from Hono/node-server.
 * Does NOT trust X-Forwarded-For (no trusted-proxy model yet).
 */
export function peerAddressFromContext(c: Context): string | undefined {
  try {
    const info = getConnInfo(c);
    const addr = info.remote?.address;
    return typeof addr === "string" ? addr : undefined;
  } catch {
    return undefined;
  }
}

export function isLoopbackRequest(c: Context): boolean {
  return isLocalPeer({
    bindHost: config.bindHost,
    peerAddress: peerAddressFromContext(c),
  });
}

/** Safe stderr + structured log when REMOTE_ACCESS_ENABLED (no secrets). */
export function logRemoteAccessEnabled(meta: {
  bindHost: string;
  port: number;
}): void {
  if (!isRemoteAccessEnabled(meta.bindHost)) return;
  process.stderr.write(
    `[gateway] REMOTE_ACCESS_ENABLED bindHost=${meta.bindHost} port=${meta.port}\n`,
  );
}

export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  const host = (hostHeader || "").toLowerCase();
  return (
    host.startsWith("127.0.0.1:") ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.startsWith("[::1]:") ||
    host === "[::1]"
  );
}

/**
 * Endpoint exposure classes (documentation + gates). Not RBAC.
 * PUBLIC_LOCAL — /health full on loopback; minimal off-loopback
 * OWNER_LOCAL — setup, pairing, browser mint (loopback + install_compat)
 * OWNER_REMOTE — devices list/revoke with Trusted Device / browser session
 * INTERNAL — diagnostics/artifacts with authenticated principal
 */
export type EndpointExposure =
  | "PUBLIC_LOCAL"
  | "OWNER_LOCAL"
  | "OWNER_REMOTE"
  | "INTERNAL";

export const ENDPOINT_EXPOSURE_NOTES = Object.freeze({
  "/health": "PUBLIC_LOCAL (full) / minimal when peer remote",
  "/v1/setup/*": "OWNER_LOCAL",
  "/v1/pairing/*": "OWNER_LOCAL",
  "/v1/host/browser-sessions": "OWNER_LOCAL",
  "/v1/devices": "OWNER_REMOTE (Trusted Device or browser AuthSession)",
  "/v1/device-auth/*": "PUBLIC challenge/verify; enroll=device credential; ensure-host=OWNER_LOCAL",
  "/workspaces": "INTERNAL (auth; install_compat local-only)",
  "/v1/diagnostics/*": "INTERNAL",
  "/artifacts/*": "INTERNAL",
  "/ws": "device|device_crypto|browser remote; install_compat local-only",
} as const);
