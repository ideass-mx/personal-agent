-- PHASE 58: user profile completion flag (requires 009_identity_foundation)
ALTER TABLE users ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0;
