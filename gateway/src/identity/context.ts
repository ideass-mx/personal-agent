/**
 * Build UserContext for Gateway operations.
 *
 * PHASE 57.3: prefer AuthSession → UserContext (server-derived).
 * Legacy resolveUserContext remains for tests / pre-session paths but never
 * accepts client-supplied userId/agentId as authority.
 */
import { ensureLocalIdentity } from "./ensure-local.ts";
import {
  resolveUserContextFromSessionId,
  userContextFromAuthSession,
} from "./auth-session-resolve.ts";
import type { AuthSession } from "./auth-session-types.ts";
import type { AuthKindCompat, UserContext } from "./types.ts";

export type ResolveUserContextInput = {
  deviceId?: string;
  nodeId?: string;
  /** Product AuthSession id when known. Prefer over WS connection id. */
  sessionId?: string;
  /** Raw WS/HTTP auth kind from protocol. */
  authKind?: "install" | "device" | "browser";
  permissions?: readonly string[];
  /**
   * Rejected if provided — UserContext is server-derived.
   * Present only so callers cannot accidentally rely on client claims.
   */
  claimedUserId?: string;
  claimedAgentId?: string;
};

function mapAuthKind(
  kind: ResolveUserContextInput["authKind"],
): AuthKindCompat | undefined {
  if (kind === "install") return "install_compat";
  if (kind === "device") return "device";
  if (kind === "browser") return "browser";
  return undefined;
}

/** Prefer AuthSession row when sessionId is a product session. */
export function resolveUserContextFromAuthSession(
  session: AuthSession,
): UserContext {
  return userContextFromAuthSession(session);
}

/**
 * Resolves UserContext.
 * If `sessionId` refers to an active AuthSession, identity comes only from that row
 * (client claimedUserId/claimedAgentId are ignored).
 * Otherwise falls back to local identity metadata (57.2 compat).
 */
export function resolveUserContext(
  input: ResolveUserContextInput = {},
): UserContext {
  if (input.sessionId) {
    const fromSession = resolveUserContextFromSessionId(input.sessionId);
    if (fromSession) {
      return fromSession.userContext;
    }
  }

  const { user, agent } = ensureLocalIdentity();
  const authKind = mapAuthKind(input.authKind);
  return {
    userId: user.id,
    agentId: agent.id,
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(authKind ? { authKind } : {}),
    ...(input.permissions ? { permissions: input.permissions } : {}),
  };
}

/** Assert HUB_TOKEN / install credential is never treated as userId. */
export function assertHubTokenIsNotUserId(
  hubToken: string,
  ctx: UserContext,
): void {
  if (hubToken && ctx.userId === hubToken) {
    throw new Error("identity_invalid: HUB_TOKEN must not equal userId");
  }
}

/** Assert HUB_TOKEN is never treated as sessionId. */
export function assertHubTokenIsNotSessionId(
  hubToken: string,
  ctx: UserContext,
): void {
  if (hubToken && ctx.sessionId === hubToken) {
    throw new Error("identity_invalid: HUB_TOKEN must not equal sessionId");
  }
}
