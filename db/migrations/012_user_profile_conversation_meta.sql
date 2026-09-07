-- PHASE 58: conversation semantic metadata (title already exists)
-- Nota: ALTER ADD COLUMN no admite DEFAULT (datetime('now')) en SQLite.
ALTER TABLE conversations ADD COLUMN summary TEXT;
ALTER TABLE conversations ADD COLUMN updated_at TEXT;

UPDATE conversations SET updated_at = created_at WHERE updated_at IS NULL;
