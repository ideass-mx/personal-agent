-- PHASE 62: Artifact lifecycle metadata (no bytes, no secrets).
ALTER TABLE artifacts ADD COLUMN status TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE artifacts ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_expires ON artifacts(expires_at);
