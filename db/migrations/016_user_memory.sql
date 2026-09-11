-- 016_user_memory — Memoria personal de largo plazo + Agent Rules (Settings).
-- Distinto de TurnMemory (historial de conversación en messages/).

CREATE TABLE user_memories (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id),
    category          TEXT NOT NULL
                        CHECK (category IN (
                          'PERSONAL',
                          'PREFERENCES',
                          'INTERESTS',
                          'GOALS',
                          'WORK_AND_PROJECTS',
                          'PEOPLE_AND_RELATIONSHIPS',
                          'HABITS',
                          'IMPORTANT_INFORMATION'
                        )),
    type              TEXT NOT NULL
                        CHECK (type IN (
                          'EXPLICIT',
                          'INFERRED',
                          'OBSERVED',
                          'IMPORTED',
                          'PROJECT_DERIVED'
                        )),
    scope             TEXT NOT NULL
                        CHECK (scope IN (
                          'GLOBAL',
                          'PROJECT',
                          'TASK',
                          'CONVERSATION',
                          'TEMPORARY'
                        )),
    content           TEXT NOT NULL,
    importance        REAL NOT NULL DEFAULT 0.5
                        CHECK (importance >= 0 AND importance <= 1),
    confidence        REAL NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
    source_type       TEXT,
    source_id         TEXT,
    source_reason     TEXT,
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN (
                          'ACTIVE',
                          'SUPERSEDED',
                          'ARCHIVED',
                          'DELETED'
                        )),
    project_id        TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at  TEXT,
    expires_at        TEXT,
    superseded_by     TEXT REFERENCES user_memories(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_memories_user_status
    ON user_memories(user_id, status);

CREATE INDEX idx_user_memories_category
    ON user_memories(user_id, category, status);

CREATE INDEX idx_user_memories_scope_project
    ON user_memories(user_id, scope, project_id, status);

CREATE INDEX idx_user_memories_updated
    ON user_memories(user_id, updated_at DESC);

-- Agent Rules viven en Settings, no en Memory.
CREATE TABLE agent_rules (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    content       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    source_type   TEXT,
    source_id     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_rules_user_status
    ON agent_rules(user_id, status);
