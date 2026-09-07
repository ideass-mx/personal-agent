/**
 * PHASE 57.3 — Product Session (AuthSession).
 *
 * Distinct from:
 * - WS `Session` in sessions/index.ts (ephemeral connection / HITL binding)
 * - pairing_sessions (PHASE 52 pairing flow)
 *
 * Credential / cookie / HUB_TOKEN is transport proof → AuthSession → UserContext.
 */
import type { AuthKindCompat } from "./types.ts";

/** Entity binding scopes (not per-tool permissions). */
export type SessionScope = "user" | "agent" | "device" | "node";

export type AuthSessionStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type AuthSession = {
  readonly id: string;
  readonly userId: string;
  readonly agentId: string;
  readonly deviceId: string | null;
  readonly nodeId: string | null;
  readonly clientName: string | null;
  readonly authKind: AuthKindCompat;
  readonly scopes: readonly SessionScope[];
  readonly status: AuthSessionStatus;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
};

export type IssueAuthSessionInput = {
  userId: string;
  agentId: string;
  authKind: AuthKindCompat;
  deviceId?: string | null;
  nodeId?: string | null;
  clientName?: string | null;
  /** Opaque transport credential (cookie token). Hashed at rest. */
  credential?: string | null;
  /**
   * Absolute expiry. Null = no auto-expire (local install_compat).
   * Prefer finite TTL for browser/device.
   */
  expiresAt?: string | null;
};

/** Default browser / device TTL (matches prior cookie TTL). */
export const AUTH_SESSION_BROWSER_TTL_MS = 12 * 60 * 60 * 1000;
export const AUTH_SESSION_DEVICE_TTL_MS = 12 * 60 * 60 * 1000;
