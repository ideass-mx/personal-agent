CREATE TABLE IF NOT EXISTS artifacts (
  id               TEXT PRIMARY KEY,
  name             TEXT,
  mime_type        TEXT,
  size             INTEGER NOT NULL,
  storage_provider TEXT NOT NULL,
  storage_key      TEXT NOT NULL,
  source_type      TEXT,
  source_server    TEXT,
  source_tool      TEXT,
  source_uri       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at);
