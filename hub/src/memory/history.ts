import { randomUUID } from "node:crypto";
import { config } from "../config.ts";
import { db } from "../db/database.ts";

export type Role = "user" | "assistant";
export interface HistoryEntry {
  role: Role;
  content: string;
}

export function touchDevice(deviceId: string, name?: string): void {
  db.prepare(
    `INSERT INTO devices (id, name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(excluded.name, name),
       last_seen_at = datetime('now')`,
  ).run(deviceId, name ?? null);
}

/** Devuelve el id recibido si existe; si no, crea una conversación nueva. */
export function ensureConversation(conversationId?: string): string {
  if (conversationId) {
    const row = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);
    if (row) return conversationId;
  }
  const id = `c_${randomUUID()}`;
  db.prepare("INSERT INTO conversations (id) VALUES (?)").run(id);
  return id;
}

export function addMessage(
  conversationId: string,
  role: Role,
  content: string,
  deviceId?: string,
): string {
  const id = `m_${randomUUID()}`;
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, device_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, conversationId, role, content, deviceId ?? null);
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
