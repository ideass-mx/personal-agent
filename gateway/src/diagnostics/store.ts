import { randomBytes } from "node:crypto";
import { db } from "../db/database.ts";
import type {
  DiagnosticEventInput,
  DiagnosticEventRecord,
} from "./types.ts";

const MAX_DIAGNOSTIC_EVENTS = 1000;
const SENSITIVE_KEY =
  /token|authorization|cookie|secret|credential|password|api[_-]?key/i;

function sanitizeString(value: string): string {
  return value
    .replace(/Authorization\s*:\s*Bearer\s+\S+/gi, "Authorization: Bearer [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/"?(token|secret|credential|password|cookie|api[_-]?key)"?\s*[:=]\s*"[^"]*"/gi, '"$1":"[redacted]"');
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value == null) return null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) continue;
      out[key] = sanitizeValue(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  return sanitizeValue(metadata) as Record<string, unknown>;
}

function ensureDiagnosticsTable(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS diagnostic_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    diagnostic_id TEXT NOT NULL,
    request_id    TEXT NOT NULL,
    component     TEXT NOT NULL,
    stage         TEXT NOT NULL,
    level         TEXT NOT NULL,
    event         TEXT NOT NULL,
    error_code    TEXT,
    message       TEXT,
    duration_ms   INTEGER,
    metadata_json TEXT
  )`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_diagnostic_events_diag ON diagnostic_events (diagnostic_id, id)",
  );
}

export class SqliteDiagnosticsStore {
  private readonly maxEvents: number;

  constructor(maxEvents = MAX_DIAGNOSTIC_EVENTS) {
    this.maxEvents = maxEvents;
    ensureDiagnosticsTable();
  }

  createDiagnosticId(): string {
    return `PA-${randomBytes(6).toString("hex").toUpperCase()}`;
  }

  record(input: DiagnosticEventInput): DiagnosticEventRecord {
    const timestamp = new Date().toISOString();
    const requestId = input.requestId || input.diagnosticId;
    const metadata = sanitizeMetadata(input.metadata);
    const message = input.message ? sanitizeString(input.message) : null;
    db.prepare(
      `INSERT INTO diagnostic_events (
        created_at, diagnostic_id, request_id, component, stage, level,
        event, error_code, message, duration_ms, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      timestamp,
      input.diagnosticId,
      requestId,
      input.component,
      input.stage,
      input.level,
      input.event,
      input.errorCode || null,
      message,
      input.durationMs ?? null,
      metadata ? JSON.stringify(metadata) : null,
    );
    db.prepare(
      `DELETE FROM diagnostic_events
       WHERE id NOT IN (
         SELECT id FROM diagnostic_events ORDER BY id DESC LIMIT ?
       )`,
    ).run(this.maxEvents);
    return {
      timestamp,
      diagnosticId: input.diagnosticId,
      requestId,
      component: input.component,
      stage: input.stage,
      level: input.level,
      event: input.event,
      errorCode: input.errorCode || null,
      message,
      durationMs: input.durationMs ?? null,
      metadata,
    };
  }

  recent(limit = 50): DiagnosticEventRecord[] {
    const rows = db
      .prepare(
        `SELECT created_at AS timestamp, diagnostic_id AS diagnosticId,
                request_id AS requestId, component, stage, level, event,
                error_code AS errorCode, message, duration_ms AS durationMs,
                metadata_json AS metadataJson
         FROM diagnostic_events
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(Math.max(1, Math.min(limit, this.maxEvents))) as Array<
      DiagnosticEventRecord & { metadataJson: string | null }
    >;
    return rows.map((row) => ({
      ...row,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
    }));
  }

  byDiagnosticId(diagnosticId: string): DiagnosticEventRecord[] {
    const rows = db
      .prepare(
        `SELECT created_at AS timestamp, diagnostic_id AS diagnosticId,
                request_id AS requestId, component, stage, level, event,
                error_code AS errorCode, message, duration_ms AS durationMs,
                metadata_json AS metadataJson
         FROM diagnostic_events
         WHERE diagnostic_id = ?
         ORDER BY id ASC`,
      )
      .all(diagnosticId) as Array<
      DiagnosticEventRecord & { metadataJson: string | null }
    >;
    return rows.map((row) => ({
      ...row,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
    }));
  }
}

export function createSqliteDiagnosticsStore(): SqliteDiagnosticsStore {
  return new SqliteDiagnosticsStore();
}

