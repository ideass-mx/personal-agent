-- Product setup / onboarding state (Gateway source of truth). No secrets.
CREATE TABLE IF NOT EXISTS setup_state (
  id                   TEXT PRIMARY KEY CHECK (id = 'default'),
  state                TEXT NOT NULL,
  installation_ready   INTEGER NOT NULL DEFAULT 0,
  llm_configured       INTEGER NOT NULL DEFAULT 0,
  verified             INTEGER NOT NULL DEFAULT 0,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  llm_provider         TEXT,
  last_error_code      TEXT,
  last_error_message   TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
