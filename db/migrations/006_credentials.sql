-- PHASE 59: credential metadata only (secrets live in SecretStore).
CREATE TABLE IF NOT EXISTS credentials (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  provider        TEXT,
  scope_json      TEXT,
  integration_id  TEXT,
  server_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT,
  status          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_server ON credentials(server_id);
CREATE INDEX IF NOT EXISTS idx_credentials_integration ON credentials(integration_id);
