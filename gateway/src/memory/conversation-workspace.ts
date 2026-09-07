/**
 * Asociación opcional Conversation → Workspace.
 * Gateway / persistencia. El Agent Runtime y TurnMemory no usan este módulo.
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/database.ts";
import type { WorkspaceSqlDb } from "../workspace/sqlite-workspace-store.ts";

export type ConversationRecord = {
  readonly id: string;
  readonly title: string | null;
  readonly summary: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workspaceId: string | null;
};

type ConversationRow = {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string | null;
  workspace_id: string | null;
};

function isFkError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code.includes("CONSTRAINT") ||
    /FOREIGN KEY/i.test(msg) ||
    /constraint/i.test(msg)
  );
}

function conversationColumns(sql: WorkspaceSqlDb): {
  hasSummary: boolean;
  hasUpdatedAt: boolean;
} {
  const cols = (
    sql.prepare(`PRAGMA table_info(conversations)`).all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  return {
    hasSummary: cols.includes("summary"),
    hasUpdatedAt: cols.includes("updated_at"),
  };
}

function mapRow(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    workspaceId: row.workspace_id,
  };
}

function selectConversationSql(sql: WorkspaceSqlDb): string {
  const { hasSummary, hasUpdatedAt } = conversationColumns(sql);
  const summary = hasSummary ? "summary" : "NULL AS summary";
  const updated = hasUpdatedAt ? "updated_at" : "created_at AS updated_at";
  return `SELECT id, title, ${summary}, created_at, ${updated}, workspace_id
          FROM conversations`;
}

export function getConversation(
  conversationId: string,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord | undefined {
  const row = sql
    .prepare(`${selectConversationSql(sql)} WHERE id = ?`)
    .get(conversationId) as ConversationRow | undefined;
  return row ? mapRow(row) : undefined;
}

/**
 * Crea un hilo. Sin workspaceId (o null) = conversación casual.
 * No crea Workspace.
 */
export function createConversation(
  options: { workspaceId?: string | null; title?: string | null } = {},
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord {
  const id = `c_${randomUUID()}`;
  const workspaceId = options.workspaceId ?? null;
  const title =
    options.title === undefined || options.title === null
      ? null
      : options.title.trim() || null;
  try {
    const { hasUpdatedAt } = conversationColumns(sql);
    if (hasUpdatedAt) {
      sql
        .prepare(
          `INSERT INTO conversations (id, title, workspace_id, updated_at)
           VALUES (?, ?, ?, datetime('now'))`,
        )
        .run(id, title, workspaceId);
    } else {
      sql
        .prepare(
          `INSERT INTO conversations (id, title, workspace_id) VALUES (?, ?, ?)`,
        )
        .run(id, title, workspaceId);
    }
  } catch (err) {
    if (workspaceId && isFkError(err)) {
      throw new Error(
        `Workspace inexistente: no se puede asociar la conversación a ${workspaceId}.`,
      );
    }
    throw err;
  }
  const created = getConversation(id, sql);
  if (!created) throw new Error("Conversation: insert no persistió.");
  return created;
}

/**
 * Asocia, cambia o desvincula (null) el Workspace de una Conversation.
 * No crea Workspace. Conversation inexistente → error.
 */
export function setConversationWorkspace(
  conversationId: string,
  workspaceId: string | null,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord {
  const current = getConversation(conversationId, sql);
  if (!current) {
    throw new Error(`Conversation inexistente: ${conversationId}.`);
  }
  try {
    sql
      .prepare(`UPDATE conversations SET workspace_id = ? WHERE id = ?`)
      .run(workspaceId, conversationId);
  } catch (err) {
    if (workspaceId && isFkError(err)) {
      throw new Error(
        `Workspace inexistente: no se puede asociar la conversación a ${workspaceId}.`,
      );
    }
    throw err;
  }
  const updated = getConversation(conversationId, sql);
  if (!updated) throw new Error("Conversation: update no persistió.");
  return updated;
}

/**
 * Hilos de un Workspace. No comprueba que el Workspace exista
 * (eso es responsabilidad del Gateway HTTP). NULL no entra: WHERE workspace_id = ?.
 * Orden: updated_at DESC, created_at DESC, id DESC (actividad reciente; created_at desempata).
 */
export function listConversationsByWorkspace(
  workspaceId: string,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord[] {
  const { hasUpdatedAt } = conversationColumns(sql);
  const order = hasUpdatedAt
    ? "ORDER BY updated_at DESC, created_at DESC, id DESC"
    : "ORDER BY created_at DESC, id DESC";
  const rows = sql
    .prepare(
      `${selectConversationSql(sql)}
       WHERE workspace_id = ?
       ${order}`,
    )
    .all(workspaceId) as ConversationRow[];
  return rows.map(mapRow);
}

/**
 * Conversaciones recientes (incl. sin Workspace). Para sidebar / lista humana.
 */
export function listRecentConversations(
  limit = 50,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord[] {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
  const { hasUpdatedAt } = conversationColumns(sql);
  const order = hasUpdatedAt
    ? "ORDER BY updated_at DESC, created_at DESC, id DESC"
    : "ORDER BY created_at DESC, id DESC";
  const rows = sql
    .prepare(
      `${selectConversationSql(sql)}
       ${order}
       LIMIT ?`,
    )
    .all(safeLimit) as ConversationRow[];
  return rows.map(mapRow);
}
