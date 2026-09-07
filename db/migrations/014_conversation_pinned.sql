-- PHASE 58.5: pin conversations for sidebar organization
ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
