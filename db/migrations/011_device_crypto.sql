-- 011_device_crypto · Ed25519 public identity on Trusted Device (PHASE 57.8)
-- private_key NEVER stored in Gateway.

ALTER TABLE trusted_devices ADD COLUMN public_key TEXT;
ALTER TABLE trusted_devices ADD COLUMN key_algorithm TEXT;
-- legacy = credential_hash only; crypto_enrolled = has public_key
ALTER TABLE trusted_devices ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE pairing_sessions ADD COLUMN public_key TEXT;
ALTER TABLE pairing_sessions ADD COLUMN key_algorithm TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_public_key_active
  ON trusted_devices(public_key)
  WHERE public_key IS NOT NULL AND status = 'ACTIVE';

CREATE TABLE device_auth_challenges (
    id              TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    challenge_hex   TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    consumed_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_device_auth_challenges_device
  ON device_auth_challenges(device_id);
