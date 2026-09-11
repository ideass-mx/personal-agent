/**
 * Persistencia SQLite de memorias de usuario.
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/database.ts";
import type {
  MemoryCategory,
  MemoryScope,
  MemoryStatus,
  MemoryType,
  UserMemory,
} from "./types.ts";

type Row = {
  id: string;
  user_id: string;
  category: string;
  type: string;
  scope: string;
  content: string;
  importance: number;
  confidence: number;
  source_type: string | null;
  source_id: string | null;
  source_reason: string | null;
  status: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  expires_at: string | null;
  superseded_by: string | null;
};

function mapRow(row: Row): UserMemory {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category as MemoryCategory,
    type: row.type as MemoryType,
    scope: row.scope as MemoryScope,
    content: row.content,
    importance: row.importance,
    confidence: row.confidence,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceReason: row.source_reason,
    status: row.status as MemoryStatus,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    expiresAt: row.expires_at,
    supersededBy: row.superseded_by,
  };
}

export type CreateMemoryInput = {
  userId: string;
  category: MemoryCategory;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  importance?: number;
  confidence?: number;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceReason?: string | null;
  projectId?: string | null;
  expiresAt?: string | null;
  status?: MemoryStatus;
};

export function createUserMemory(input: CreateMemoryInput): UserMemory {
  const id = `mem_${randomUUID()}`;
  const content = input.content.trim();
  if (!content) throw new Error("memory_content_blank");
  db.prepare(
    `INSERT INTO user_memories (
      id, user_id, category, type, scope, content,
      importance, confidence, source_type, source_id, source_reason,
      status, project_id, expires_at
    ) VALUES (
      @id, @user_id, @category, @type, @scope, @content,
      @importance, @confidence, @source_type, @source_id, @source_reason,
      @status, @project_id, @expires_at
    )`,
  ).run({
    id,
    user_id: input.userId,
    category: input.category,
    type: input.type,
    scope: input.scope,
    content,
    importance: input.importance ?? 0.5,
    confidence: input.confidence ?? 0.5,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    source_reason: input.sourceReason ?? null,
    status: input.status ?? "ACTIVE",
    project_id: input.projectId ?? null,
    expires_at: input.expiresAt ?? null,
  });
  const created = getUserMemoryById(id);
  if (!created) throw new Error("memory_create_failed");
  return created;
}

export function getUserMemoryById(id: string): UserMemory | null {
  const row = db
    .prepare(`SELECT * FROM user_memories WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export type ListMemoriesFilter = {
  userId: string;
  status?: MemoryStatus | MemoryStatus[];
  category?: MemoryCategory;
  scope?: MemoryScope;
  projectId?: string | null;
  query?: string;
  includeExpired?: boolean;
};

export function listUserMemories(filter: ListMemoriesFilter): UserMemory[] {
  const statuses = filter.status
    ? Array.isArray(filter.status)
      ? filter.status
      : [filter.status]
    : (["ACTIVE"] as MemoryStatus[]);
  const placeholders = statuses.map(() => "?").join(",");
  const params: unknown[] = [filter.userId, ...statuses];
  let sql = `SELECT * FROM user_memories WHERE user_id = ? AND status IN (${placeholders})`;
  if (filter.category) {
    sql += ` AND category = ?`;
    params.push(filter.category);
  }
  if (filter.scope) {
    sql += ` AND scope = ?`;
    params.push(filter.scope);
  }
  if (filter.projectId !== undefined) {
    if (filter.projectId === null) {
      sql += ` AND project_id IS NULL`;
    } else {
      sql += ` AND project_id = ?`;
      params.push(filter.projectId);
    }
  }
  if (filter.query?.trim()) {
    sql += ` AND content LIKE ?`;
    params.push(`%${filter.query.trim()}%`);
  }
  if (!filter.includeExpired) {
    sql += ` AND (expires_at IS NULL OR expires_at > datetime('now'))`;
  }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  const rows = db.prepare(sql).all(...params) as Row[];
  return rows.map(mapRow);
}

export function updateUserMemory(
  id: string,
  patch: {
    content?: string;
    category?: MemoryCategory;
    type?: MemoryType;
    scope?: MemoryScope;
    importance?: number;
    confidence?: number;
    sourceReason?: string | null;
    status?: MemoryStatus;
    projectId?: string | null;
    expiresAt?: string | null;
    supersededBy?: string | null;
    touchAccessed?: boolean;
  },
): UserMemory {
  const current = getUserMemoryById(id);
  if (!current) throw new Error("memory_not_found");
  const content =
    patch.content !== undefined ? patch.content.trim() : current.content;
  if (!content) throw new Error("memory_content_blank");
  db.prepare(
    `UPDATE user_memories SET
      content = @content,
      category = @category,
      type = @type,
      scope = @scope,
      importance = @importance,
      confidence = @confidence,
      source_reason = @source_reason,
      status = @status,
      project_id = @project_id,
      expires_at = @expires_at,
      superseded_by = @superseded_by,
      last_accessed_at = CASE WHEN @touch = 1 THEN datetime('now') ELSE last_accessed_at END,
      updated_at = datetime('now')
    WHERE id = @id`,
  ).run({
    id,
    content,
    category: patch.category ?? current.category,
    type: patch.type ?? current.type,
    scope: patch.scope ?? current.scope,
    importance: patch.importance ?? current.importance,
    confidence: patch.confidence ?? current.confidence,
    source_reason:
      patch.sourceReason !== undefined
        ? patch.sourceReason
        : current.sourceReason,
    status: patch.status ?? current.status,
    project_id:
      patch.projectId !== undefined ? patch.projectId : current.projectId,
    expires_at:
      patch.expiresAt !== undefined ? patch.expiresAt : current.expiresAt,
    superseded_by:
      patch.supersededBy !== undefined
        ? patch.supersededBy
        : current.supersededBy,
    touch: patch.touchAccessed ? 1 : 0,
  });
  const updated = getUserMemoryById(id);
  if (!updated) throw new Error("memory_not_found");
  return updated;
}

/** Olvidar = soft-delete (DELETED). */
export function forgetUserMemory(id: string): UserMemory {
  return updateUserMemory(id, { status: "DELETED" });
}

export function supersedeUserMemory(
  oldId: string,
  replacement: CreateMemoryInput,
): { readonly old: UserMemory; readonly next: UserMemory } {
  const next = createUserMemory(replacement);
  const old = updateUserMemory(oldId, {
    status: "SUPERSEDED",
    supersededBy: next.id,
  });
  return { old, next };
}

export function mergeIntoUserMemory(
  targetId: string,
  opts: { content?: string; confidenceBoost?: number; sourceReason?: string },
): UserMemory {
  const current = getUserMemoryById(targetId);
  if (!current) throw new Error("memory_not_found");
  const confidence = Math.min(
    1,
    current.confidence + (opts.confidenceBoost ?? 0.1),
  );
  return updateUserMemory(targetId, {
    content: opts.content ?? current.content,
    confidence,
    sourceReason: opts.sourceReason ?? current.sourceReason,
  });
}

export function expireDueMemories(userId: string): number {
  const result = db
    .prepare(
      `UPDATE user_memories
       SET status = 'ARCHIVED', updated_at = datetime('now')
       WHERE user_id = ?
         AND status = 'ACTIVE'
         AND expires_at IS NOT NULL
         AND expires_at <= datetime('now')`,
    )
    .run(userId);
  return result.changes;
}
