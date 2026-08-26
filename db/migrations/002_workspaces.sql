-- 002_workspaces · contexto de trabajo persistente (PHASE 12)
-- Sin FK a conversations. Sin agent_id / node_id / filesystem.

CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_workspaces_updated
    ON workspaces(updated_at DESC, id DESC);
