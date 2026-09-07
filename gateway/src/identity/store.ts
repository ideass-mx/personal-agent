/**
 * SQLite persistence for User + PersonalAgent (same Gateway DB).
 */
import { db } from "../db/database.ts";
import type { PersonalAgent, PersonalAgentStatus, User } from "./types.ts";

type UserRow = { id: string; name: string; created_at: string };
type AgentRow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  created_at: string;
};

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapAgent(row: AgentRow): PersonalAgent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status as PersonalAgentStatus,
    createdAt: row.created_at,
  };
}

export function getUserById(id: string): User | null {
  const row = db
    .prepare(`SELECT id, name, created_at FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function insertUser(input: { id: string; name: string }): User {
  db.prepare(`INSERT INTO users (id, name) VALUES (?, ?)`).run(
    input.id,
    input.name,
  );
  const row = getUserById(input.id);
  if (!row) throw new Error("identity_user_insert_failed");
  return row;
}

export function getPersonalAgentById(id: string): PersonalAgent | null {
  const row = db
    .prepare(
      `SELECT id, user_id, name, status, created_at FROM personal_agents WHERE id = ?`,
    )
    .get(id) as AgentRow | undefined;
  return row ? mapAgent(row) : null;
}

export function getPersonalAgentByUserId(userId: string): PersonalAgent | null {
  const row = db
    .prepare(
      `SELECT id, user_id, name, status, created_at FROM personal_agents WHERE user_id = ? LIMIT 1`,
    )
    .get(userId) as AgentRow | undefined;
  return row ? mapAgent(row) : null;
}

export function insertPersonalAgent(input: {
  id: string;
  userId: string;
  name: string;
  status?: PersonalAgentStatus;
}): PersonalAgent {
  db.prepare(
    `INSERT INTO personal_agents (id, user_id, name, status) VALUES (?, ?, ?, ?)`,
  ).run(input.id, input.userId, input.name, input.status ?? "ACTIVE");
  const row = getPersonalAgentById(input.id);
  if (!row) throw new Error("identity_agent_insert_failed");
  return row;
}

/** Backfill ownership on trusted_devices that lack user_id/agent_id. */
export function annotateTrustedDevicesOwnership(input: {
  userId: string;
  agentId: string;
}): number {
  const result = db
    .prepare(
      `UPDATE trusted_devices
       SET user_id = COALESCE(user_id, ?),
           agent_id = COALESCE(agent_id, ?)
       WHERE user_id IS NULL OR agent_id IS NULL`,
    )
    .run(input.userId, input.agentId);
  return result.changes;
}

export function setTrustedDeviceOwnership(
  deviceId: string,
  input: { userId: string; agentId: string },
): void {
  db.prepare(
    `UPDATE trusted_devices SET user_id = ?, agent_id = ? WHERE device_id = ?`,
  ).run(input.userId, input.agentId, deviceId);
}
