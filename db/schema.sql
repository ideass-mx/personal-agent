-- Esquema lógico actual (migraciones 001–003). El runtime aplica db/migrations/.

CREATE TABLE devices (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_workspaces_updated
    ON workspaces(updated_at DESC, id DESC);

CREATE TABLE conversations (
    id           TEXT PRIMARY KEY,
    title        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX idx_conversations_workspace
    ON conversations(workspace_id);

CREATE TABLE messages (
    id               TEXT PRIMARY KEY,
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content          TEXT NOT NULL,
    device_id        TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_conversation
    ON messages(conversation_id, created_at);
