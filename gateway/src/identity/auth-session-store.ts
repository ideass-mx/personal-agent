/**
 * SQLite AuthSession registry (product Session).
 */
import { createHash, randomUUID } from "node:crypto";
import { db } from "../db/database.ts";
import type {
  AuthSession,
  AuthSessionStatus,
  IssueAuthSessionInput,
  SessionScope,
} from "./auth-session-types.ts";
import type { AuthKindCompat } from "./types.ts";

type Row = {
  id: string;
  user_id: string;
  agent_id: string;
  device_id: string | null;
  node_id: string | null;
  client_name: string | null;
  auth_kind: string;
  scopes: string;
  status: string;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function parseScopes(raw: string): SessionScope[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SessionScope =>
        s === "user" || s === "agent" || s === "device" || s === "node",
    );
  } catch {
    return [];
  }
}

function mapRow(row: Row): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    deviceId: row.device_id,
    nodeId: row.node_id,
    clientName: row.client_name,
    authKind: row.auth_kind as AuthKindCompat,
    scopes: parseScopes(row.scopes),
    status: row.status as AuthSessionStatus,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function buildScopes(input: {
  deviceId?: string | null;
  nodeId?: string | null;
}): SessionScope[] {
  const scopes: SessionScope[] = ["user", "agent"];
  if (input.deviceId) scopes.push("device");
  if (input.nodeId) scopes.push("node");
  return scopes;
}

function isPastExpiry(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= nowMs;
}

/** Mark ACTIVE rows past expires_at as EXPIRED. */
export function expireOverdueAuthSessions(nowMs = Date.now()): number {
  const nowIso = new Date(nowMs).toISOString();
  const result = db
    .prepare(
      `UPDATE auth_sessions
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE'
         AND expires_at IS NOT NULL
         AND expires_at <= ?`,
    )
    .run(nowIso);
  return result.changes;
}

export function getAuthSessionById(id: string): AuthSession | null {
  expireOverdueAuthSessions();
  const row = db
    .prepare(
      `SELECT id, user_id, agent_id, device_id, node_id, client_name, auth_kind, scopes,
              status, created_at, last_seen_at, expires_at, revoked_at
       FROM auth_sessions WHERE id = ?`,
    )
    .get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function getAuthSessionByCredential(
  credential: string,
): AuthSession | null {
  expireOverdueAuthSessions();
  const hash = hashCredential(credential);
  const row = db
    .prepare(
      `SELECT id, user_id, agent_id, device_id, node_id, client_name, auth_kind, scopes,
              status, created_at, last_seen_at, expires_at, revoked_at
       FROM auth_sessions WHERE credential_hash = ?`,
    )
    .get(hash) as Row | undefined;
  return row ? mapRow(row) : null;
}

/**
 * True iff session exists, ACTIVE, not past expiresAt.
 * Does not trust client-supplied userId/agentId.
 */
export function isSessionActive(sessionId: string): boolean {
  const session = getAuthSessionById(sessionId);
  if (!session) return false;
  if (session.status !== "ACTIVE") return false;
  if (isPastExpiry(session.expiresAt, Date.now())) {
    db.prepare(
      `UPDATE auth_sessions SET status = 'EXPIRED' WHERE id = ? AND status = 'ACTIVE'`,
    ).run(sessionId);
    return false;
  }
  return true;
}

export function touchAuthSession(sessionId: string): void {
  db.prepare(
    `UPDATE auth_sessions SET last_seen_at = datetime('now')
     WHERE id = ? AND status = 'ACTIVE'`,
  ).run(sessionId);
}

export function issueAuthSession(input: IssueAuthSessionInput): AuthSession {
  expireOverdueAuthSessions();
  const id = `as_${randomUUID()}`;
  const scopes = buildScopes({
    deviceId: input.deviceId,
    nodeId: input.nodeId,
  });
  const credentialHash = input.credential
    ? hashCredential(input.credential)
    : null;
  const expiresAt = input.expiresAt === undefined ? null : input.expiresAt;

  db.prepare(
    `INSERT INTO auth_sessions
       (id, user_id, agent_id, device_id, node_id, client_name, auth_kind, scopes, status,
        created_at, last_seen_at, expires_at, revoked_at, credential_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'), ?, NULL, ?)`,
  ).run(
    id,
    input.userId,
    input.agentId,
    input.deviceId ?? null,
    input.nodeId ?? null,
    input.clientName ?? null,
    input.authKind,
    JSON.stringify(scopes),
    expiresAt,
    credentialHash,
  );

  const row = getAuthSessionById(id);
  if (!row) throw new Error("auth_session_insert_failed");
  return row;
}

/**
 * Revoke session immediately. Returns true if status became REVOKED
 * (or was already REVOKED). False if unknown id.
 */
export function revokeSession(sessionId: string): boolean {
  const existing = getAuthSessionById(sessionId);
  if (!existing) return false;
  if (existing.status === "REVOKED") return true;
  db.prepare(
    `UPDATE auth_sessions
     SET status = 'REVOKED', revoked_at = datetime('now')
     WHERE id = ?`,
  ).run(sessionId);
  return true;
}

/** Active AuthSession ids bound to a device (for device revoke cascade). */
export function listActiveAuthSessionIdsByDevice(deviceId: string): string[] {
  expireOverdueAuthSessions();
  const rows = db
    .prepare(
      `SELECT id FROM auth_sessions
       WHERE device_id = ? AND status = 'ACTIVE'`,
    )
    .all(deviceId) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Mark all ACTIVE sessions for device as REVOKED. Returns revoked ids. */
export function revokeAuthSessionRowsForDevice(deviceId: string): string[] {
  const ids = listActiveAuthSessionIdsByDevice(deviceId);
  for (const id of ids) {
    db.prepare(
      `UPDATE auth_sessions
       SET status = 'REVOKED', revoked_at = datetime('now')
       WHERE id = ? AND status = 'ACTIVE'`,
    ).run(id);
  }
  return ids;
}

/** Issue install_compat Session from HUB_TOKEN proof (token never stored). */
export function issueInstallCompatSession(input: {
  userId: string;
  agentId: string;
  deviceId?: string | null;
}): AuthSession {
  return issueAuthSession({
    userId: input.userId,
    agentId: input.agentId,
    authKind: "install_compat",
    deviceId: input.deviceId ?? null,
    // Local install: no auto-expire; revoke or rotate HUB_TOKEN to end access.
    expiresAt: null,
  });
}
