-- 010_auth_sessions · Product Session registry (PHASE 57.3)
-- Distinct from pairing_sessions and from ephemeral WS connection Session.

CREATE TABLE auth_sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    device_id       TEXT,
    node_id         TEXT,
    client_name     TEXT,
    auth_kind       TEXT NOT NULL
                      CHECK (auth_kind IN ('install_compat', 'device', 'browser')),
    scopes          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at    TEXT,
    expires_at      TEXT,
    revoked_at      TEXT,
    credential_hash TEXT
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_agent ON auth_sessions(agent_id);
CREATE INDEX idx_auth_sessions_device ON auth_sessions(device_id);
CREATE INDEX idx_auth_sessions_status ON auth_sessions(status);
CREATE UNIQUE INDEX idx_auth_sessions_credential_hash
  ON auth_sessions(credential_hash)
  WHERE credential_hash IS NOT NULL;
