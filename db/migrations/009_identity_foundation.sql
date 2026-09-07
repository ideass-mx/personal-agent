-- 009_identity_foundation · User + PersonalAgent + Device ownership columns
-- PHASE 57.2: local-first identity. Does not replace HUB_TOKEN (install_compat).

CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE personal_agents (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_personal_agents_user ON personal_agents(user_id);

-- Annotate existing trusted devices with ownership (nullable → backfilled at boot).
ALTER TABLE trusted_devices ADD COLUMN user_id TEXT;
ALTER TABLE trusted_devices ADD COLUMN agent_id TEXT;

CREATE INDEX idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_agent ON trusted_devices(agent_id);
