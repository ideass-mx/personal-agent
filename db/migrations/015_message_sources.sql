-- 015 · fuentes estructuradas por mensaje (PHASE 60.15.1)
-- JSON array de AgentSource; NULL = sin fuentes.

ALTER TABLE messages ADD COLUMN sources_json TEXT;
