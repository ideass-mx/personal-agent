/**
 * Adapter SQLite de WorkspaceStore. Vive en el Gateway, no en el Agent Runtime.
 * No importa MCP ni WS.
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/database.ts";
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceStore,
  WorkspaceUpdateInput,
} from "./types.ts";

type SqlStatement = {
  run: (...params: any[]) => { changes: number };
  get: (...params: any[]) => unknown;
  all: (...params: any[]) => unknown[];
};

export type WorkspaceSqlDb = {
  prepare: (sql: string) => SqlStatement;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function trimName(name: string): string {
  const n = name.trim();
  if (n.length === 0) {
    throw new Error("Workspace: name no puede estar vacío.");
  }
  return n;
}

function mapRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  constructor(private readonly sql: WorkspaceSqlDb) {}

  createWorkspace(input: WorkspaceCreateInput): Workspace {
    const name = trimName(input.name);
    const description =
      input.description === undefined
        ? null
        : input.description === null
          ? null
          : input.description.trim() || null;
    const id = `w_${randomUUID()}`;
    this.sql
      .prepare(
        `INSERT INTO workspaces (id, name, description) VALUES (?, ?, ?)`,
      )
      .run(id, name, description);
    const created = this.getWorkspace(id);
    if (!created) throw new Error("Workspace: insert no persistió.");
    return created;
  }

  getWorkspace(id: string): Workspace | undefined {
    const row = this.sql
      .prepare(
        `SELECT id, name, description, created_at, updated_at
         FROM workspaces WHERE id = ?`,
      )
      .get(id) as WorkspaceRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  listWorkspaces(): Workspace[] {
    const rows = this.sql
      .prepare(
        `SELECT id, name, description, created_at, updated_at
         FROM workspaces
         ORDER BY updated_at DESC, id DESC`,
      )
      .all() as WorkspaceRow[];
    return rows.map(mapRow);
  }

  updateWorkspace(
    id: string,
    patch: WorkspaceUpdateInput,
  ): Workspace | undefined {
    const current = this.getWorkspace(id);
    if (!current) return undefined;
    const name =
      patch.name === undefined ? current.name : trimName(patch.name);
    const description =
      patch.description === undefined
        ? current.description
        : patch.description === null
          ? null
          : patch.description.trim() || null;
    this.sql
      .prepare(
        `UPDATE workspaces
         SET name = ?, description = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(name, description, id);
    return this.getWorkspace(id);
  }

  deleteWorkspace(id: string): boolean {
    const result = this.sql
      .prepare(`DELETE FROM workspaces WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }
}

export function createSqliteWorkspaceStore(
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): WorkspaceStore {
  return new SqliteWorkspaceStore(sql);
}
