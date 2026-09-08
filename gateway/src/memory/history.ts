import { randomUUID } from "node:crypto";
import type { AgentSource } from "../../../packages/protocol/messages.ts";
import { config } from "../config.ts";
import { db } from "../db/database.ts";
import type { WorkspaceSqlDb } from "../workspace/sqlite-workspace-store.ts";
import type { HistoryEntry, Role } from "./types.ts";

export type { HistoryEntry, Role } from "./types.ts";

export type StoredMessage = {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  deviceId: string | null;
  createdAt: string;
  sources?: AgentSource[];
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  device_id: string | null;
  created_at: string;
  sources_json?: string | null;
};

export function touchDevice(deviceId: string, name?: string): void {
  db.prepare(
    `INSERT INTO devices (id, name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(excluded.name, name),
       last_seen_at = datetime('now')`,
  ).run(deviceId, name ?? null);
}

/** Si el cliente envía conversationId, se reutiliza (aunque la fila aún no exista). */
export function ensureConversation(conversationId?: string): string {
  if (conversationId) {
    const row = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);
    if (row) return conversationId;
    db.prepare("INSERT INTO conversations (id) VALUES (?)").run(conversationId);
    return conversationId;
  }
  const id = `c_${randomUUID()}`;
  db.prepare("INSERT INTO conversations (id) VALUES (?)").run(id);
  return id;
}

function serializeSources(
  sources: readonly AgentSource[] | undefined,
): string | null {
  if (!sources || sources.length === 0) return null;
  return JSON.stringify(sources);
}

function parseSourcesJson(
  raw: string | null | undefined,
): AgentSource[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as AgentSource[];
  } catch {
    return undefined;
  }
}

export function addMessage(
  conversationId: string,
  role: Role,
  content: string,
  deviceId?: string,
  sources?: readonly AgentSource[],
): string {
  const id = `m_${randomUUID()}`;
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, device_id, sources_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    conversationId,
    role,
    content,
    deviceId ?? null,
    serializeSources(sources),
  );
  return id;
}

/** Últimos N mensajes en orden cronológico — el contexto para el cerebro. */
export function getHistory(conversationId: string): HistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT role, content FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(conversationId, config.historyWindow) as HistoryEntry[];
  return rows.reverse();
}

/** Mensajes de una Conversation en orden cronológico (oldest → newest). */
export function listConversationMessages(
  conversationId: string,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): StoredMessage[] {
  const rows = sql
    .prepare(
      `SELECT id, conversation_id, role, content, device_id, created_at, sources_json
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(conversationId) as MessageRow[];
  return rows.map((row) => {
    const sources = parseSourcesJson(row.sources_json);
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      deviceId: row.device_id,
      createdAt: row.created_at,
      ...(sources ? { sources } : {}),
    };
  });
}
