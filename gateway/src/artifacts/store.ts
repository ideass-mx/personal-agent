/**
 * Persistencia de metadata Artifact en SQLite (sin blobs).
 */
import { db } from "../db/database.ts";
import type {
  Artifact,
  ArtifactProvenance,
  ArtifactSourceType,
  ArtifactStatus,
} from "./types.ts";
import { isArtifactStatus } from "./types.ts";

export type ArtifactRowInsert = {
  id: string;
  name?: string;
  mimeType?: string;
  size: number;
  storageProvider: string;
  storageKey: string;
  provenance?: ArtifactProvenance;
  status?: ArtifactStatus;
  expiresAt?: string | null;
};

function isSourceType(value: string): value is ArtifactSourceType {
  return (
    value === "mcp" ||
    value === "native" ||
    value === "generated" ||
    value === "imported"
  );
}

const SELECT = `SELECT id, name, mime_type AS mimeType, size,
              storage_provider AS storageProvider, storage_key AS storageKey,
              source_type AS sourceType, source_server AS sourceServer,
              source_tool AS sourceTool, source_uri AS sourceUri,
              status, expires_at AS expiresAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM artifacts WHERE id = ?`;

type Row = {
  id: string;
  name: string | null;
  mimeType: string | null;
  size: number;
  storageProvider: string;
  storageKey: string;
  sourceType: string | null;
  sourceServer: string | null;
  sourceTool: string | null;
  sourceUri: string | null;
  status: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

function rowToArtifact(row: Row): Artifact {
  let provenance: ArtifactProvenance | undefined;
  if (row.sourceType && isSourceType(row.sourceType)) {
    provenance = {
      sourceType: row.sourceType,
      serverId: row.sourceServer ?? undefined,
      toolName: row.sourceTool ?? undefined,
      uri: row.sourceUri ?? undefined,
    };
  }
  const status =
    row.status && isArtifactStatus(row.status) ? row.status : "AVAILABLE";
  return {
    id: row.id,
    name: row.name ?? undefined,
    mimeType: row.mimeType ?? undefined,
    size: row.size,
    storage: {
      provider: row.storageProvider,
      key: row.storageKey,
    },
    provenance,
    status,
    expiresAt: row.expiresAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
  };
}

export function insertArtifactRow(row: ArtifactRowInsert): Artifact {
  const status = row.status ?? "AVAILABLE";
  db.prepare(
    `INSERT INTO artifacts (
       id, name, mime_type, size, storage_provider, storage_key,
       source_type, source_server, source_tool, source_uri,
       status, expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  ).run(
    row.id,
    row.name ?? null,
    row.mimeType ?? null,
    row.size,
    row.storageProvider,
    row.storageKey,
    row.provenance?.sourceType ?? null,
    row.provenance?.serverId ?? null,
    row.provenance?.toolName ?? null,
    row.provenance?.uri ?? null,
    status,
    row.expiresAt ?? null,
  );
  const loaded = getArtifactRow(row.id);
  if (!loaded) throw new Error(`Artifact insert falló: ${row.id}`);
  return loaded;
}

export function getArtifactRow(id: string): Artifact | undefined {
  const row = db.prepare(SELECT).get(id) as Row | undefined;
  if (!row) return undefined;
  return rowToArtifact(row);
}

export function updateArtifactStatus(
  id: string,
  status: ArtifactStatus,
): void {
  db.prepare(
    `UPDATE artifacts SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, id);
}

export function deleteArtifactRow(id: string): boolean {
  const r = db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id);
  return r.changes > 0;
}

/** Soft-delete: marca DELETED (metadata permanece). */
export function markArtifactDeleted(id: string): boolean {
  const info = db
    .prepare(
      `UPDATE artifacts SET status = 'DELETED', updated_at = datetime('now') WHERE id = ? AND status != 'DELETED'`,
    )
    .run(id);
  return info.changes > 0;
}
