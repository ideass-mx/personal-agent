-- 004_pairing · PairingSession + TrustedDevice

CREATE TABLE pairing_sessions (
    id              TEXT PRIMARY KEY,
    secret_hash     TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN (
                        'PENDING',
                        'AWAITING_CONFIRMATION',
                        'APPROVED',
                        'REJECTED',
                        'EXPIRED',
                        'CONSUMED'
                    )),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL,
    device_id       TEXT,
    device_name     TEXT,
    platform        TEXT,
    consumed_at     TEXT
);

CREATE INDEX idx_pairing_sessions_status ON pairing_sessions(status);

CREATE TABLE trusted_devices (
    device_id         TEXT PRIMARY KEY,
    name              TEXT,
    platform          TEXT,
    paired_at         TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen         TEXT,
    permissions       TEXT NOT NULL DEFAULT '["agent.connect"]',
    status            TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED'))
                      DEFAULT 'ACTIVE',
    credential_hash   TEXT NOT NULL
);

CREATE INDEX idx_trusted_devices_status ON trusted_devices(status);
