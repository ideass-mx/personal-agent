/**
 * Resolve / issue AuthSessions and derive UserContext (server-side only).
 */
import {
  AUTH_SESSION_BROWSER_TTL_MS,
  AUTH_SESSION_DEVICE_TTL_MS,
  type AuthSession,
} from "./auth-session-types.ts";
import {
  getAuthSessionByCredential,
  getAuthSessionById,
  isSessionActive,
  issueAuthSession,
  issueInstallCompatSession,
  touchAuthSession,
} from "./auth-session-store.ts";
import { ensureLocalIdentity } from "./ensure-local.ts";
import type { UserContext } from "./types.ts";
import { db } from "../db/database.ts";

function findActiveInstallCompatSession(
  userId: string,
  agentId: string,
): AuthSession | null {
  const hit = db
    .prepare(
      `SELECT id FROM auth_sessions
       WHERE user_id = ? AND agent_id = ? AND auth_kind = 'install_compat'
         AND status = 'ACTIVE'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, agentId) as { id: string } | undefined;
  if (!hit) return null;
  const row = getAuthSessionById(hit.id);
  if (!row || !isSessionActive(row.id)) return null;
  return row;
}

/** Derive UserContext from AuthSession. Ignores any client-claimed ids. */
export function userContextFromAuthSession(session: AuthSession): UserContext {
  return {
    userId: session.userId,
    agentId: session.agentId,
    sessionId: session.id,
    authKind: session.authKind,
    ...(session.deviceId ? { deviceId: session.deviceId } : {}),
    ...(session.nodeId ? { nodeId: session.nodeId } : {}),
    permissions: [...session.scopes],
  };
}

/**
 * Load active AuthSession by id and derive UserContext.
 * Returns null if missing / revoked / expired.
 */
export function resolveUserContextFromSessionId(
  sessionId: string,
): { session: AuthSession; userContext: UserContext } | null {
  if (!isSessionActive(sessionId)) return null;
  const session = getAuthSessionById(sessionId);
  if (!session) return null;
  touchAuthSession(session.id);
  return { session, userContext: userContextFromAuthSession(session) };
}

/** HUB_TOKEN proof → install_compat AuthSession (reuse ACTIVE local session). */
export function resolveInstallCompatSession(input?: {
  deviceId?: string;
}): { session: AuthSession; userContext: UserContext } {
  const { user, agent } = ensureLocalIdentity();
  const existing = findActiveInstallCompatSession(user.id, agent.id);
  if (existing) {
    touchAuthSession(existing.id);
    return {
      session: existing,
      userContext: userContextFromAuthSession(existing),
    };
  }
  const session = issueInstallCompatSession({
    userId: user.id,
    agentId: agent.id,
    deviceId: input?.deviceId ?? null,
  });
  return { session, userContext: userContextFromAuthSession(session) };
}

/** Device credential already verified → AuthSession. */
export function resolveDeviceAuthSession(input: {
  deviceId: string;
}): { session: AuthSession; userContext: UserContext } {
  const { user, agent } = ensureLocalIdentity();
  const expiresAt = new Date(
    Date.now() + AUTH_SESSION_DEVICE_TTL_MS,
  ).toISOString();
  const session = issueAuthSession({
    userId: user.id,
    agentId: agent.id,
    authKind: "device",
    deviceId: input.deviceId,
    expiresAt,
  });
  return { session, userContext: userContextFromAuthSession(session) };
}

/** Cookie credential → active browser AuthSession (or null). */
export function resolveBrowserAuthSession(
  cookieToken: string | undefined,
): { session: AuthSession; userContext: UserContext; deviceName: string } | null {
  if (!cookieToken) return null;
  const session = getAuthSessionByCredential(cookieToken);
  if (!session || !isSessionActive(session.id)) return null;
  if (session.authKind !== "browser") return null;
  touchAuthSession(session.id);
  return {
    session,
    userContext: userContextFromAuthSession(session),
    deviceName: session.clientName || session.deviceId || "Navegador",
  };
}

/** Create browser AuthSession bound to cookie credential. */
export function issueBrowserAuthSession(input: {
  deviceId: string;
  deviceName?: string;
  cookieToken: string;
  expiresAt: string;
}): AuthSession {
  const { user, agent } = ensureLocalIdentity();
  return issueAuthSession({
    userId: user.id,
    agentId: agent.id,
    authKind: "browser",
    deviceId: input.deviceId,
    clientName: input.deviceName ?? "Navegador",
    credential: input.cookieToken,
    expiresAt: input.expiresAt,
  });
}

export function browserSessionExpiresAt(
  nowMs = Date.now(),
): string {
  return new Date(nowMs + AUTH_SESSION_BROWSER_TTL_MS).toISOString();
}
