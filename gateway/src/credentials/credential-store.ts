/**
 * Persistencia de metadata Credential en SQLite (sin secretos).
 */
import { db } from "../db/database.ts";
import {
  assertSafeCredentialId,
  isCredentialKind,
  isCredentialStatus,
  type CredentialMetadata,
  type CredentialStatus,
  type CreateCredentialInput,
} from "./types.ts";

type Row = {
  id: string;
  name: string;
  kind: string;
  provider: string | null;
  scopeJson: string | null;
  integrationId: string | null;
  serverId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  status: string;
};

function rowToMeta(row: Row): CredentialMetadata {
  if (!isCredentialKind(row.kind)) {
    throw new Error(`Credential metadata: kind inválido ${row.kind}`);
  }
  if (!isCredentialStatus(row.status)) {
    throw new Error(`Credential metadata: status inválido ${row.status}`);
  }
  let scope: string[] | undefined;
  if (row.scopeJson) {
    try {
      const parsed = JSON.parse(row.scopeJson) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        scope = parsed;
      }
    } catch {
      scope = undefined;
    }
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    provider: row.provider ?? undefined,
    scope,
    integrationId: row.integrationId ?? undefined,
    serverId: row.serverId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? undefined,
    status: row.status,
  };
}

const SELECT = `SELECT id, name, kind, provider,
  scope_json AS scopeJson, integration_id AS integrationId,
  server_id AS serverId, created_at AS createdAt, updated_at AS updatedAt,
  expires_at AS expiresAt, status
  FROM credentials WHERE id = ?`;

export function insertCredentialMetadata(
  input: CreateCredentialInput & { id: string; status: CredentialStatus },
): CredentialMetadata {
  const id = assertSafeCredentialId(input.id);
  const name = input.name.trim();
  if (!name) throw new Error("Credential: name obligatorio");
  if (!isCredentialKind(input.kind)) {
    throw new Error(`Credential: kind inválido`);
  }
  const scopeJson =
    input.scope && input.scope.length > 0
      ? JSON.stringify([...input.scope])
      : null;

  db.prepare(
    `INSERT INTO credentials (
       id, name, kind, provider, scope_json, integration_id, server_id,
       created_at, updated_at, expires_at, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)`,
  ).run(
    id,
    name,
    input.kind,
    input.provider?.trim() || null,
    scopeJson,
    input.integrationId?.trim() || null,
    input.serverId?.trim() || null,
    input.expiresAt?.trim() || null,
    input.status,
  );
  const loaded = getCredentialMetadata(id);
  if (!loaded) throw new Error(`Credential insert falló: ${id}`);
  return loaded;
}

export function getCredentialMetadata(
  credentialId: string,
): CredentialMetadata | null {
  const id = assertSafeCredentialId(credentialId);
  const row = db.prepare(SELECT).get(id) as Row | undefined;
  if (!row) return null;
  return rowToMeta(row);
}

export function updateCredentialStatus(
  credentialId: string,
  status: CredentialStatus,
): void {
  const id = assertSafeCredentialId(credentialId);
  const info = db
    .prepare(
      `UPDATE credentials SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(status, id);
  if (info.changes === 0) {
    throw new Error(`Credential no encontrada: ${id}`);
  }
}

export function deleteCredentialMetadata(credentialId: string): void {
  const id = assertSafeCredentialId(credentialId);
  db.prepare(`DELETE FROM credentials WHERE id = ?`).run(id);
}

/** Comprueba que la migración no introdujo columna secret. */
export function credentialsTableHasSecretColumn(): boolean {
  const cols = db.prepare(`PRAGMA table_info(credentials)`).all() as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name.toLowerCase() === "secret");
}
